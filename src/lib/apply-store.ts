import { createHash } from "node:crypto";

import { z } from "@/lib/z";

import { ConsentType, MemberRole, Prisma } from "@/generated/prisma/client";
import {
  APPLY_CONSENTS,
  EVIDENCE_CONSENT_VERSION,
  METRICS_CONSENT_VERSION,
} from "@/content/consent";
import {
  ApplySchema,
  validateInviteEmail,
  type ApplyFieldErrors,
} from "@/lib/apply";
import { devNow } from "@/lib/dev-clock";
import { LATE_PASS_MESSAGE, type LatePassFailureCode } from "@/lib/late-entry";
import { claimLatePassIn, loadApplyGate } from "@/lib/late-entry-store";
import { sendTeamInvite } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason } from "@/lib/season";
import { inviteValidUntil } from "@/lib/team";
import { createInviteIn, loadJoinWindow } from "@/lib/team-store";

/*
  참가 신청 저장. **서버 전용이다** — 규칙(길이·형식)은 apply.ts에 있고 그쪽은
  클라이언트도 읽는다.

  이 파일이 하는 일은 한 문장이다: 팀을 만들고 · 참가를 만들고 · 동의를 기록하고
  · (팀 참가면) 초대를 만든다. 넷이 한 트랜잭션이어야 하는 이유는 동의 때문이다.
  참가만 생기고 동의 로그가 빠지면 "동의 없이 수집한 개인정보"가 되고, 그 입증
  책임이 우리에게 있다. 지각 편입 링크로 온 신청이면 그 링크를 쓰는 일도 같은
  트랜잭션에 든다(2026-09-26, late-entry-store `claimLatePassIn`).

  ⚠️ **초대 메일은 그 트랜잭션 밖이다.** 아래 submitApplication의 주석 참고.

  ⚠️ team-store와 **서로 import한다**(여기 → createInviteIn·loadJoinWindow, 저기 →
  applyConsentRows·hashIp). 양쪽 다 함수 안에서만 쓰고 모듈 최상단에서는 상대를
  건드리지 않아서 순환이 풀린다. 최상단으로 끌어올리지 말 것.
*/

/** 화면이 구분해서 안내해야 하는 실패들. 필드 오류와 성격이 다르다. */
export type ApplyFailureCode =
  | "NOT_RECRUITING"
  | "ALREADY_APPLIED"
  | "CONSENT_REQUIRED"
  /* 지각 편입 링크로 온 신청 — 링크가 죽었다(late-entry.ts) */
  | LatePassFailureCode;

/**
 * 편입 링크를 조건부로 쓰지 못했다 — 그사이 다른 탭이 먼저 썼거나 운영자가 취소했다.
 * 트랜잭션을 되돌리는 신호다(참가·팀·동의가 같이 사라진다).
 */
class LatePassTaken extends Error {}

/** 이번 시즌에 이미 다른 팀으로 참가 중이다 — 트랜잭션을 되돌리는 신호 */
class AlreadyEntered extends Error {}

export type ApplyResult =
  | { ok: true; entryId: string }
  | {
      ok: false;
      code?: ApplyFailureCode;
      errors?: ApplyFieldErrors;
      message?: string;
    };

/**
 * 동의 증빙용 IP 해시.
 *
 * 원문을 저장하지 않는 이유: "같은 사람이 동의했는가"만 알면 되므로 원문이
 * 필요 없고, IP 원문은 위치 추정이 가능한 개인정보다.
 *
 * ⚠️ 소금 없이 해시하면 의미가 없다 — IPv4는 전수가 43억 개라 무염 해시는
 * 하루면 역산된다. 소금이 없으면 해시를 만들지 않고 null로 남긴다.
 * 동의 사실 자체는 행의 존재와 createdAt으로 증명되고, ipHash는 보강 증거다.
 */
export function hashIp(ip: string | null): string | null {
  const salt = process.env.CONSENT_IP_SALT ?? process.env.AUTH_SECRET;
  if (!ip || ip === "unknown" || !salt) return null;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/*
  ⚠️ 두 표는 **APPLY_CONSENTS에 있는 키만** 담는다. 09-21에 privacy·terms가
  가입 동의 모달로 옮겨 가면서 여기서도 빠졌다(consent.ts의 참가 신청 주석).
  이미 그 종류로 쌓인 행은 그대로 둔다 — consents는 append-only 로그다.
*/
const CONSENT_VERSIONS: Record<string, string> = {
  metrics: METRICS_CONSENT_VERSION,
  evidence: EVIDENCE_CONSENT_VERSION,
};

/** 동의 키 → 로그에 남길 종류. 화면의 키와 DB enum이 1:1이 아니라 표로 둔다. */
const CONSENT_TYPES: Record<string, ConsentType> = {
  metrics: ConsentType.metrics_public,
  evidence: ConsentType.evidence,
};

export interface ApplyContext {
  /** 동의 증빙. 없으면 null로 남는다 */
  ip: string | null;
  userAgent: string | null;
}

/**
 * 참가 동의 2종을 로그 행으로 바꾼다.
 *
 * 신청(팀장)과 합류(팀원)가 **같은 함수**를 쓴다. 합류하는 사람도 지표 공개와
 * 증빙 제출에 스스로 동의해야 한다 — 팀장의 동의가 팀원 것을 대신하지 못한다
 * (운영규칙서 D2: 항목별·본인별 동의).
 */
export function applyConsentRows(args: {
  userId: string;
  entryId: string;
  consent: Record<string, boolean>;
  ipHash: string | null;
  userAgent: string | null;
}) {
  return APPLY_CONSENTS.map((item) => ({
    userId: args.userId,
    entryId: args.entryId,
    type: CONSENT_TYPES[item.key],
    granted: Boolean(args.consent[item.key]),
    version: CONSENT_VERSIONS[item.key],
    ipHash: args.ipHash,
    userAgent: args.userAgent,
  }));
}

/** 필수 동의가 빠졌는지. 화면을 거치지 않은 호출도 여기서 막힌다 */
export function missingRequiredConsents(
  consent: Record<string, boolean>,
): boolean {
  return APPLY_CONSENTS.some((c) => c.required && !consent[c.key]);
}

export async function submitApplication(
  /** 초대 메일이 보내는 사람을 적어야 해서 닉네임까지 받는다(실명은 쓰지 않는다) */
  user: { id: string; email: string; nickname: string },
  raw: {
    isSolo: boolean;
    track: string;
    teamName: string;
    ideaTitle: string;
    ideaSummary: string;
    inviteEmail: string;
  },
  consent: Record<string, boolean>,
  context: ApplyContext,
  /**
   * 지각 편입 링크의 코드(`/apply?late=`). 모집 중에는 보지 않는다 — 링크 없이도
   * 열려 있다. 모집이 아닐 때 이것이 유효해야만 접수한다(`loadApplyGate`).
   */
  lateCode: string | null = null,
): Promise<ApplyResult> {
  const parsed = ApplySchema.safeParse(raw);
  const errors: ApplyFieldErrors = parsed.success
    ? {}
    : z.flattenError(parsed.error).fieldErrors;

  /*
    초대 칸만 스키마 밖에서 본다 — 본인 주소인지는 세션을 알아야 판정이 선다
    (apply.ts의 validateInviteEmail 주석). 스키마 오류와 같은 묶음으로 돌려준다.
  */
  const inviteError = validateInviteEmail({
    isSolo: Boolean(raw.isSolo),
    inviteEmail: raw.inviteEmail,
    selfEmail: user.email,
  });
  if (inviteError) errors.inviteEmail = [inviteError];

  if (!parsed.success || inviteError) return { ok: false, errors };
  const { isSolo, teamName, ideaTitle, ideaSummary } = parsed.data;
  const inviteEmail = isSolo ? null : raw.inviteEmail.trim();

  /*
    ⚠️ 필수 동의는 화면이 아니라 여기서 막는다. 서버 액션은 폼을 거치지 않고
    직접 호출할 수 있으므로, 체크박스를 안 거친 요청이 그대로 들어올 수 있다.
  */
  if (missingRequiredConsents(consent)) {
    return {
      ok: false,
      code: "CONSENT_REQUIRED",
      message: "필수 항목에 동의해야 참가 신청을 접수할 수 있어요.",
    };
  }

  /*
    받는 기간 판정은 참가 신청 화면과 **같은 함수**(`loadApplyGate`)다. 모집 중이면
    평소 신청, 모집이 아니면 유효한 지각 편입 링크가 있을 때만 받는다. 모집 판정은
    그 안에서 랜딩 CTA와 같은 `resolveLandingCta`를 쓴다 — 랜딩은 「참가 신청」을
    띄우는데 /apply는 닫혀 있는(혹은 그 반대인) 상태가 생기면 안 된다.
  */
  const season = await getCurrentSeason();
  const gate = await loadApplyGate(season, lateCode);
  if (!season || gate.kind === "closed") {
    const failure = gate.kind === "closed" ? gate.failure : null;
    return failure
      ? { ok: false, code: failure, message: LATE_PASS_MESSAGE[failure] }
      : {
          ok: false,
          code: "NOT_RECRUITING",
          message: "지금은 참가 신청을 받고 있지 않습니다.",
        };
  }
  /* 링크를 쓸 때의 판정 시각. 판정과 같은 시계다(dev-clock.ts) */
  const now = devNow();

  const ipHash = hashIp(context.ip);
  const userAgent = context.userAgent?.slice(0, 500) ?? null;

  try {
    const created = await prisma.$transaction(async (tx) => {
      /*
        ⚠️ 이번 시즌에 이미 참가 중인 사람(다른 팀의 팀원이어도)은 받지 않는다 —
        합류(team-store `acceptInvite`)와 같은 조회다. 한 사람이 두 팀에 있으면 상호
        테스터 배정과 지표 제외가 무너지고 두 번 시상 대상이 된다. 아래 유니크
        (@@unique([seasonId, teamId]))는 **같은 팀**의 중복만 막는다.

        화면(page.tsx `findMyEntry`)도 막지만 믿지 않는다. 서버 액션은 직접 부를 수
        있고, 레이스 중에는 합류도 열려 있어(2026-09-25) 편입 폼을 연 채 다른 탭에서
        초대를 수락할 수 있다(2026-09-26 리뷰 지적). 편입 링크를 쓰기 전에 막으므로
        링크는 대기로 남는다.
      */
      const mine = await tx.entry.findFirst({
        where: { seasonId: season.id, team: { members: { some: { userId: user.id } } } },
        select: { id: true },
      });
      if (mine) throw new AlreadyEntered();

      /*
        팀은 시즌을 넘어 유지된다(용어 정의: 팀 ≠ 참가). 이미 팀장인 팀이 있으면
        새로 만들지 않고 그 팀으로 참가한다 — 시즌2에 나갈 때 팀이 하나 더 생기면
        같은 사람들이 두 팀으로 보이고 팀 단위 이력이 끊긴다.
      */
      const leading = await tx.teamMember.findFirst({
        where: { userId: user.id, role: MemberRole.leader },
        select: { teamId: true },
      });

      const team = leading
        ? await tx.team.update({
            where: { id: leading.teamId },
            data: { name: teamName, isSolo },
          })
        : await tx.team.create({
            data: {
              name: teamName,
              isSolo,
              members: { create: { userId: user.id, role: MemberRole.leader } },
            },
          });

      /*
        ⚠️ trackId를 넣지 않는다. 폼이 track을 보내고 서버가 검사까지 하지만
        시즌1은 단일 트랙이라 null로 남긴다(apply.ts의 트랙 주석).
      */
      const entry = await tx.entry.create({
        data: {
          seasonId: season.id,
          teamId: team.id,
          ideaTitle,
          ideaSummary: ideaSummary || null,
          appliedAt: new Date(),
        },
        select: { id: true },
      });

      /*
        지각 편입 링크로 온 신청이면 링크를 여기서 쓴다 — 참가와 **같은 트랜잭션**.
        위의 판정과 이 쓰기 사이에 다른 탭이 먼저 쓰거나 운영자가 취소할 수 있어서,
        대기 중일 때만 바뀌는 조건부 쓰기로 한 번 더 본다. 0건이면 전부 되돌린다.
        참가 자체는 평소 신청과 똑같다 — 별도 「지각」 상태를 두지 않는다(PRD OPEN-6).
      */
      if (gate.kind === "late") {
        const claimed = await claimLatePassIn(tx, {
          code: gate.code,
          seasonId: season.id,
          userId: user.id,
          entryId: entry.id,
          now,
        });
        if (!claimed) throw new LatePassTaken();
      }

      /*
        동의는 참가에 붙여 남긴다(entryId). 같은 사람이 시즌2에 다시 신청하면
        그때의 문안 버전으로 새 행이 쌓인다 — 덮어쓰면 "그때 무엇에 동의했는지"가
        사라져 입증이 불가능해진다.
      */
      await tx.consent.createMany({
        data: applyConsentRows({
          userId: user.id,
          entryId: entry.id,
          consent,
          ipHash,
          userAgent,
        }),
      });

      /*
        초대 **레코드**는 여기, 트랜잭션 안이다. 접수는 됐는데 초대 행만 없으면
        팀장이 「팀으로 참가」를 골라 놓고 아무도 부를 수 없는 상태가 된다.
        만드는 일은 팀 화면과 **같은 함수**(createInviteIn)가 한다 — 정원·중복
        초대·만료 정리 규칙이 두 벌이 되면 한쪽만 고쳐지는 날이 온다.
      */
      let invite: { code: string; expiresAt: Date } | null = null;
      if (inviteEmail) {
        const made = await createInviteIn(tx, team.id, inviteEmail);
        if (made.ok) {
          invite = { code: made.code, expiresAt: made.expiresAt };
        } else {
          /*
            ⚠️ 여기서 접수를 되돌리지 않는다. 올 수 있는 값은 사실상
            INVITE_EXISTS 하나다 — 지난 시즌에 쓰던 팀에 아직 살아 있는 초대가
            남은 경우. 그 초대가 이미 팀원을 부를 수 있으니 참가를 깰 이유가
            없고, 팀장은 팀 화면에서 취소하고 다시 보낼 수 있다.
          */
          console.warn(
            `[apply] 초대를 만들지 못했습니다(${made.code}). team=${team.id}`,
          );
        }
      }

      return { entryId: entry.id, teamName: team.name, invite };
    });

    /*
      ⚠️ **메일은 트랜잭션 밖이다.** 안에 넣으면 외부 API 한 번이 접수 전체를
      물고 있게 된다 — Resend가 느리면 DB 트랜잭션이 그만큼 열려 있고, 실패하면
      접수가 통째로 롤백되어 사용자는 아무것도 못 한 채 처음부터 다시 신청해야
      한다. 메일은 다시 보낼 수 있고 접수는 그렇지 않다.

      실패는 로그로 남기고 넘어간다. 초대 행은 pending으로 살아 있어서 팀장이
      팀 화면에서 코드를 직접 전하거나, 취소하고 다시 발급할 수 있다.
    */
    if (created.invite && inviteEmail) {
      try {
        /*
          메일의 「유효 기한」은 팀 관리 화면이 보내는 초대와 같은 규칙이다 — 만료와
          합류 마감(s1 달력 마감) 중 이른 쪽(team.ts `inviteValidUntil`, 2026-09-26).
          모집 중에 보낸 초대도 레이스로 넘어가 s1 마감에 닫힌다. 읽다가 실패해도
          접수는 살아 있어야 해서 이 try 안에서 읽는다.
        */
        const joinWindow = await loadJoinWindow(season);
        const sent = await sendTeamInvite({
          email: inviteEmail,
          inviterNickname: user.nickname,
          teamName: created.teamName,
          ideaTitle,
          seasonTitle: season.title,
          code: created.invite.code,
          validUntil: inviteValidUntil(created.invite.expiresAt, joinWindow),
        });
        if (!sent.ok) {
          console.error(
            `[apply] 초대 메일 실패(${sent.reason}). 접수는 됐고 초대는 살아 있습니다. entry=${created.entryId}`,
          );
        }
      } catch (error) {
        /* 메일 모듈은 던지지 않기로 돼 있지만, 그 약속에 접수를 걸지 않는다 */
        console.error("[apply] 초대 메일에서 예외가 났습니다.", error);
      }
    }

    return { ok: true, entryId: created.entryId };
  } catch (error) {
    /*
      링크를 먼저 빼앗겼다. 무엇 때문인지 다시 읽어 그 사유로 안내한다 — 다른 탭이
      썼으면 「이미 사용됨」, 운영자가 취소했으면 「취소됨」.
    */
    if (error instanceof AlreadyEntered) {
      return {
        ok: false,
        code: "ALREADY_APPLIED",
        message: "이번 시즌에 이미 참가 중입니다.",
      };
    }
    if (error instanceof LatePassTaken) {
      const again = await loadApplyGate(season, lateCode);
      const failure =
        again.kind === "closed" && again.failure ? again.failure : "LATE_PASS_USED";
      return { ok: false, code: failure, message: LATE_PASS_MESSAGE[failure] };
    }
    /*
      @@unique([seasonId, teamId])의 최종 방어선. 같은 사람이 두 탭에서 동시에
      제출하면 조회와 생성 사이를 빠져나갈 수 있다. 이미 신청된 것은 오류가
      아니라 "이미 됐다"이므로 그대로 안내한다.
    */
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        code: "ALREADY_APPLIED",
        message: "이미 참가 신청이 접수된 팀입니다.",
      };
    }
    throw error;
  }
}

/** 이 사람이 이번 시즌에 이미 신청했는가. 화면 분기와 신청 내역 표시에 쓴다. */
export async function findMyEntry(userId: string, seasonId: string) {
  return prisma.entry.findFirst({
    where: {
      seasonId,
      team: { members: { some: { userId } } },
    },
    select: {
      id: true,
      ideaTitle: true,
      ideaSummary: true,
      stage: true,
      status: true,
      appliedAt: true,
      team: { select: { name: true, isSolo: true } },
    },
  });
}
