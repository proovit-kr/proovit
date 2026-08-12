import { createHash } from "node:crypto";

import { z } from "zod";

import { ConsentType, MemberRole, Prisma } from "@/generated/prisma/client";
import {
  APPLY_CONSENTS,
  APPLY_PRIVACY_CONSENT_VERSION,
  METRICS_CONSENT_VERSION,
  TERMS_CONSENT_VERSION,
} from "@/content/consent";
import { ApplySchema, type ApplyFieldErrors } from "@/lib/apply";
import { prisma } from "@/lib/prisma";
import { getCurrentSeason, resolveLandingCta } from "@/lib/season";

/*
  참가 신청 저장. **서버 전용이다** — 규칙(길이·형식)은 apply.ts에 있고 그쪽은
  클라이언트도 읽는다.

  이 파일이 하는 일은 한 문장이다: 팀을 만들고 · 참가를 만들고 · 동의를 기록한다.
  셋이 한 트랜잭션이어야 하는 이유는 동의 때문이다. 참가만 생기고 동의 로그가
  빠지면 "동의 없이 수집한 개인정보"가 되고, 그 입증 책임이 우리에게 있다.
*/

/** 화면이 구분해서 안내해야 하는 실패들. 필드 오류와 성격이 다르다. */
export type ApplyFailureCode =
  | "NOT_RECRUITING"
  | "ALREADY_APPLIED"
  | "CONSENT_REQUIRED";

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
function hashIp(ip: string | null): string | null {
  const salt = process.env.CONSENT_IP_SALT ?? process.env.AUTH_SECRET;
  if (!ip || ip === "unknown" || !salt) return null;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

const CONSENT_VERSIONS: Record<string, string> = {
  privacy: APPLY_PRIVACY_CONSENT_VERSION,
  terms: TERMS_CONSENT_VERSION,
  metrics: METRICS_CONSENT_VERSION,
};

/** 동의 키 → 로그에 남길 종류. 화면의 키와 DB enum이 1:1이 아니라 표로 둔다. */
const CONSENT_TYPES: Record<string, ConsentType> = {
  privacy: ConsentType.privacy,
  terms: ConsentType.terms,
  metrics: ConsentType.metrics_public,
};

export interface ApplyContext {
  /** 동의 증빙. 없으면 null로 남는다 */
  ip: string | null;
  userAgent: string | null;
}

export async function submitApplication(
  user: { id: string },
  raw: {
    isSolo: boolean;
    teamName: string;
    ideaTitle: string;
    ideaSummary: string;
    phone: string;
  },
  consent: Record<string, boolean>,
  context: ApplyContext,
): Promise<ApplyResult> {
  const parsed = ApplySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  }
  const { isSolo, teamName, ideaTitle, ideaSummary, phone } = parsed.data;

  /*
    ⚠️ 필수 동의는 화면이 아니라 여기서 막는다. 서버 액션은 폼을 거치지 않고
    직접 호출할 수 있으므로, 체크박스를 안 거친 요청이 그대로 들어올 수 있다.
  */
  const missing = APPLY_CONSENTS.filter((c) => c.required && !consent[c.key]);
  if (missing.length > 0) {
    return {
      ok: false,
      code: "CONSENT_REQUIRED",
      message: "필수 항목에 동의해야 참가 신청을 접수할 수 있어요.",
    };
  }

  /*
    모집 기간 판정은 랜딩 CTA와 **같은 함수**를 쓴다. 랜딩은 "신청하기"를 띄우는데
    /apply는 닫혀 있는(혹은 그 반대인) 상태가 생기면 안 된다.
  */
  const season = await getCurrentSeason();
  if (!season || resolveLandingCta(season).kind !== "APPLY") {
    return {
      ok: false,
      code: "NOT_RECRUITING",
      message: "지금은 참가 신청을 받고 있지 않습니다.",
    };
  }

  const ipHash = hashIp(context.ip);
  const userAgent = context.userAgent?.slice(0, 500) ?? null;

  try {
    const entryId = await prisma.$transaction(async (tx) => {
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
        연락처는 users.phone에 둔다(entries가 아니라). 통지 대상은 사람이지
        참가가 아니고, 같은 사람이 시즌마다 번호를 다시 적게 만들 이유가 없다.
        알림톡 수신(notifyAlimtalk)은 여기서 켜지 않는다 — 발신프로필 심사가
        끝나지 않았고, 수신 여부는 별도 선택 항목이라 한 번에 묶으면 D2 위반이다.
      */
      await tx.user.update({ where: { id: user.id }, data: { phone } });

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
        동의는 참가에 붙여 남긴다(entryId). 같은 사람이 시즌2에 다시 신청하면
        그때의 문안 버전으로 새 행이 쌓인다 — 덮어쓰면 "그때 무엇에 동의했는지"가
        사라져 입증이 불가능해진다.
      */
      await tx.consent.createMany({
        data: APPLY_CONSENTS.map((item) => ({
          userId: user.id,
          entryId: entry.id,
          type: CONSENT_TYPES[item.key],
          granted: Boolean(consent[item.key]),
          version: CONSENT_VERSIONS[item.key],
          ipHash,
          userAgent,
        })),
      });

      return entry.id;
    });

    return { ok: true, entryId };
  } catch (error) {
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

/**
 * 참가 신청이 확정된 사람인가.
 *
 * 실명 잠금의 판정 기준이다 — 실명은 상금 지급 때 예금주와 대조하는 값이라
 * 계약이 성립한 뒤에는 조용히 바뀌면 안 된다(profile-store.ts 머리 주석).
 * 시즌을 가리지 않는다: 지난 시즌 입상자의 실명도 정산 근거로 남아 있다.
 */
export async function hasAnyEntry(userId: string): Promise<boolean> {
  const found = await prisma.entry.findFirst({
    where: { team: { members: { some: { userId } } } },
    select: { id: true },
  });
  return found !== null;
}
