import {
  AbuseStatus,
  CreditDelivery,
  CreditDeliveredVia,
  CreditKind,
  CreditOfferStatus,
  CreditUnlockEvent,
  EntryStatus,
  NotifChannel,
  SanctionReason,
  SanctionStatus,
  SeasonPhase,
  Prisma,
} from "@/generated/prisma/client";
import { REASON_MIN } from "@/lib/admin";
import { type CreditCardState, releaseDue } from "@/lib/credits";
import {
  gate1Settled,
  issueCredit,
  judgeCredit,
  noticeCreditDelivered,
} from "@/lib/credits-store";
import { fmtStamp } from "@/lib/header-state";
import {
  LATE_ENTRY_BLOCK_MESSAGE,
  LATE_PASS_LENGTH,
  LATE_PASS_PREFIX,
  lateEntryBlock,
  latePassExpiry,
  latePassHint,
  latePassPendingWhere,
} from "@/lib/late-entry";
import { loadLateEntryDeadline } from "@/lib/late-entry-store";
import { prisma } from "@/lib/prisma";
import { planPhaseSchedule } from "@/lib/season-phase";
import { generateCode } from "@/lib/team-store";

/*
  운영자 쓰기.

  ⚠️ **모든 쓰기는 감사 로그와 한 트랜잭션이다.** 스키마가 `audit_logs.reason`을
  NOT NULL로 잡아둔 이유가 이것이다 — 실격·오버라이드는 나중에 반드시 "왜 그랬냐"를
  묻게 되고, 그때 meta JSONB 안에 있을 수도 없을 수도 있는 값에 기대면 답을 못 한다.

  로그만 따로 쓰면 상태는 바뀌었는데 근거가 없는 행이 생긴다. 그 조합이 분쟁에서
  가장 나쁘다 — 우리가 바꿨다는 사실만 남고 이유가 없다.
*/

export type AdminActionResult =
  | { ok: true }
  | { ok: false; message: string };

type AuditInput = {
  /** 사람이 아니면(페이즈 크론) null — 감사 로그 화면에 「system」으로 뜬다 */
  actorId: string | null;
  /** judge_pass / disqualify / refund 처럼 동사로 적는다 */
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  meta?: Prisma.InputJsonValue;
};

/**
 * 감사 로그 한 줄. **트랜잭션 안에서만 부른다.**
 *
 * `tx`를 받는 이유는 강제하기 위해서다 — 인자로 prisma 전역을 넘길 수도 있지만,
 * 그러면 "로그를 깜빡한 쓰기"가 조용히 통과한다.
 *
 * 페이즈 크론(`phase-schedule.ts`)도 이것을 쓴다 — 수동 전환과 자동 전환이
 * 같은 모양(`season.phase`, meta from/to)으로 남아야 한 표에서 이어 읽힌다.
 */
export async function writeAudit(
  tx: Prisma.TransactionClient,
  input: AuditInput,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      meta: input.meta,
    },
  });
}

/**
 * 참가 상태 변경 — 실격·복구.
 *
 * ⚠️ **진도(stage)는 건드리지 않는다.** 상태와 진도는 직교한다(스키마 EntryStatus
 * 주석) — 실격된 팀도 "어디까지 왔었는지"가 남아 있어야 소명이 인용됐을 때
 * 그 자리로 되돌릴 수 있다. 실격을 진도 초기화로 처리하면 복구가 불가능해진다.
 */
export async function setEntryStatus(args: {
  entryId: string;
  status: EntryStatus;
  reason: string;
  actorId: string;
}): Promise<AdminActionResult> {
  const { entryId, status, reason, actorId } = args;
  if (reason.trim().length < REASON_MIN) {
    return { ok: false, message: `사유를 ${REASON_MIN}자 이상 적어 주세요.` };
  }

  const entry = await prisma.entry.findUnique({
    where: { id: entryId },
    select: { status: true },
  });
  if (!entry) return { ok: false, message: "참가 기록을 찾을 수 없습니다." };
  if (entry.status === status) {
    return { ok: false, message: "이미 그 상태입니다." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.entry.update({ where: { id: entryId }, data: { status } });
    await writeAudit(tx, {
      actorId,
      action: "entry.status",
      targetType: "entry",
      targetId: entryId,
      reason: reason.trim(),
      /* 되돌릴 때 필요한 것은 "무엇에서 무엇으로"다 */
      meta: { from: entry.status, to: status },
    });
  });

  return { ok: true };
}

export type CreateLatePassResult =
  | { ok: true; code: string; expiresAt: Date }
  | { ok: false; message: string };

/**
 * 지각 편입 링크 만들기 — 참가 관리의 「지각 편입」 칸(시안에 없는 칸).
 *
 * 2026-09-26 수연 지시 「문의가 오면 운영자가 수동 편입하는 화면과 로직」 · PRD OPEN-6.
 * 참가 행이 아니라 1회용 링크를 만드는 이유는 schema.prisma의 LateEntryPass 주석이다.
 *
 * 만들 수 있는 때는 참가자 쪽이 받아 주는 때와 **같은 판정**(`lateEntryBlock`)이다 —
 * 만들어 봐야 받지 않는 링크를 건네지 않는다. 기한은 min(7일, s1 달력 마감).
 *
 * 링크 행과 감사 로그가 한 트랜잭션이다(파일 머리 주석). 로그에는 코드 일부만 남긴다
 * (`latePassHint`) — 지우지 않는 기록에 살아 있는 링크를 통째로 담지 않는다.
 * 메일은 보내지 않는다. 운영자가 문의가 온 채널로 링크를 직접 보낸다.
 */
export async function createLatePass(args: {
  seasonId: string;
  reason: string;
  actorId: string;
}): Promise<CreateLatePassResult> {
  const { seasonId, actorId } = args;
  const reason = args.reason.trim();
  if (reason.length < REASON_MIN) {
    return { ok: false, message: `사유를 ${REASON_MIN}자 이상 적어 주세요.` };
  }

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { phase: true },
  });
  if (!season) return { ok: false, message: "시즌을 찾을 수 없습니다." };

  /* 참가자 쪽 판정과 같은 「지금」(dev-clock.ts) — 개발에서 옮긴 오늘로 잰다 */
  const { devNow } = await import("@/lib/dev-clock");
  const now = devNow();
  const deadline = await loadLateEntryDeadline(seasonId);
  const block = lateEntryBlock(season.phase, deadline, now);
  if (block) return { ok: false, message: LATE_ENTRY_BLOCK_MESSAGE[block] };
  const expiresAt = latePassExpiry(now, deadline);

  /*
    코드 충돌은 만들기 전에 피한다 — 초대 발급(team-store `createInviteIn`)과 같은
    이유다. 트랜잭션 안에서 P2002를 받으면 감사 로그까지 통째로 되돌아간다.
    최종 방어선은 유니크 제약이고, 27^8이라 부딪힐 일은 실질적으로 없다.
  */
  let code = generateCode(LATE_PASS_PREFIX, LATE_PASS_LENGTH);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const taken = await prisma.lateEntryPass.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!taken) break;
    code = generateCode(LATE_PASS_PREFIX, LATE_PASS_LENGTH);
  }

  await prisma.$transaction(async (tx) => {
    const pass = await tx.lateEntryPass.create({
      data: { seasonId, code, reason, createdBy: actorId, expiresAt },
      select: { id: true },
    });
    await writeAudit(tx, {
      actorId,
      action: "entry.late_pass",
      targetType: "late_entry_pass",
      targetId: pass.id,
      reason,
      /* 감사 로그 화면의 대상 칸은 `meta.target`을 먼저 읽는다(admin-read `loadAuditLines`) */
      meta: {
        target: `편입 링크 ${latePassHint(code)}`,
        code: latePassHint(code),
        expiresAt: expiresAt.toISOString(),
      },
    });
  });

  return { ok: true, code, expiresAt };
}

/** 취소하려던 링크가 그사이 대기가 아니게 됐다 — 트랜잭션을 되돌리는 신호 */
class LatePassNotPending extends Error {}

/**
 * 지각 편입 링크 취소. **대기 중인 링크만** — 쓰인 링크는 이미 참가가 됐고, 그걸
 * 무르는 것은 참가 상태 전환(`setEntryStatus`)이다. 기한이 지난 링크는 이미 못 쓴다.
 *
 * 「대기」의 조건은 참가자가 링크를 쓸 때와 같다(`latePassPendingWhere`). 조건부로
 * 한 번에 쓰므로, 참가자가 같은 순간에 제출하면 둘 중 한쪽만 된다.
 */
export async function revokeLatePass(args: {
  seasonId: string;
  passId: string;
  reason: string;
  actorId: string;
}): Promise<AdminActionResult> {
  const { seasonId, passId, actorId } = args;
  const reason = args.reason.trim();
  if (reason.length < REASON_MIN) {
    return { ok: false, message: `사유를 ${REASON_MIN}자 이상 적어 주세요.` };
  }

  /* 시즌을 같이 본다 — id만 믿으면 헤더에서 고른 시즌 밖의 링크를 건드린다 */
  const pass = await prisma.lateEntryPass.findFirst({
    where: { id: passId, seasonId },
    select: { code: true },
  });
  if (!pass) return { ok: false, message: "편입 링크를 찾을 수 없습니다." };

  const { devNow } = await import("@/lib/dev-clock");
  const now = devNow();
  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.lateEntryPass.updateMany({
        where: { id: passId, ...latePassPendingWhere(now) },
        data: { revokedAt: new Date() },
      });
      if (count === 0) throw new LatePassNotPending();
      await writeAudit(tx, {
        actorId,
        action: "entry.late_pass_revoke",
        targetType: "late_entry_pass",
        targetId: passId,
        reason,
        meta: { target: `편입 링크 ${latePassHint(pass.code)}` },
      });
    });
  } catch (error) {
    if (error instanceof LatePassNotPending) {
      return { ok: false, message: "이미 사용됐거나 취소됐거나 기한이 지난 링크입니다." };
    }
    throw error;
  }
  return { ok: true };
}

/**
 * 시즌 페이즈 수동 전환.
 *
 * ⚠️ 정본은 크론이다 — `season_schedules`를 읽어 예정 시각에 전환한다(ADR-010).
 * 이 함수는 **앞당기거나 되돌리는** 예외 경로이고, 그래서 사유가 필수다.
 * 해당 페이즈의 일정 행이 있으면 `applied_at`·`applied_by`·`note`를 함께 채운다 —
 * 그러지 않으면 크론이 나중에 같은 전환을 한 번 더 한다.
 */
export async function setSeasonPhase(args: {
  seasonId: string;
  phase: SeasonPhase;
  reason: string;
  actorId: string;
}): Promise<AdminActionResult> {
  const { seasonId, phase, reason, actorId } = args;
  if (reason.trim().length < REASON_MIN) {
    return { ok: false, message: `사유를 ${REASON_MIN}자 이상 적어 주세요.` };
  }

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { phase: true },
  });
  if (!season) return { ok: false, message: "시즌을 찾을 수 없습니다." };
  if (season.phase === phase) {
    return { ok: false, message: "이미 그 페이즈입니다." };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.season.update({ where: { id: seasonId }, data: { phase } });
    await tx.seasonSchedule.updateMany({
      where: { seasonId, phase, appliedAt: null },
      data: { appliedAt: now, appliedBy: actorId, note: reason.trim() },
    });
    await writeAudit(tx, {
      actorId,
      action: "season.phase",
      targetType: "season",
      targetId: seasonId,
      reason: reason.trim(),
      meta: { from: season.phase, to: phase },
    });
  });

  return { ok: true };
}

/** 읽은 뒤 저장하기 전에 크론이 먼저 전환한 행이 있다 — 트랜잭션을 되돌리는 신호 */
class ScheduleRaced extends Error {}

/**
 * 페이즈 일정 — 크론(`/api/v1/cron/phase`)이 읽는 `season_schedules`를 고친다.
 *
 * 시안에 없는 칸이다(seasons/page.tsx 머리 주석). 크론은 이 표만 읽는데 행을
 * 넣을 화면이 없어 SQL로만 넣을 수 있었다(2026-09-25 수연 지시로 크론을 만들며 더함).
 *
 * 다섯 줄을 한 트랜잭션으로 쓴다 — 스테이지 일정과 같은 이유다. 반만 저장되면
 * 크론이 어긋난 순서 그대로 돈다.
 *
 *   · 빠진 페이즈는 그대로 둔다. null은 비운다(전환 안 된 행을 지운다).
 *   · 전환된 행(`applied_at`)은 못 바꾼다 — 이미 일어난 일의 기록이다.
 *     그래서 수동으로 되돌린 페이즈를 크론으로 다시 넘길 길은 없다. 그때는
 *     「페이즈 수동 전환」을 한 번 더 쓴다.
 *   무엇이 바뀌었고 받아도 되는지는 순수 함수 `planPhaseSchedule`(season-phase.ts)이 정한다.
 *
 * **racing 행을 저장하면 `seasons.starts_at`(개막)도 같은 값으로 옮긴다** — 같은
 * 트랜잭션이고, 감사 로그 meta에 `startsAt` from/to가 남는다. 기획 문서 순서가
 * 「모집 마감 → 개막 = 레이스 시작 = s1 시작」이라서다(2026-09-26 수연 결정. PRD
 * 2장 타임라인 「모집 8/31~9/27 마감 → 킥오프~레이스 9/28~」, PLN3 3.2 지각 참가
 * 「racing(s1 구간) × applied」). 모집과 s1은 겹치지 않는다. racing 행을 비우면
 * 개막은 그대로 둔다. 무엇을 옮길지는 `planPhaseSchedule`이 정한다.
 *   → 2026-09-26 뒤집음: 「개막은 건드리지 않는다. racing 행은 모집 마감 다음
 *   분이고 개막(s1 시작)은 그보다 한 주 앞」이라고 적고 개막 맞추기를 뺐었다.
 *   시안 ver4 본편의 「참가 신청 마감 10.04 23:59」(= s1 마감일)를 근거로 삼았는데,
 *   그 날짜가 기획과 어긋난 시안 날짜였다. 개발 바 픽스처(dev-sandbox
 *   `scheduleStageDates`)가 `starts_at`을 s1 시작으로 쓰는 것은 이제 같은 말이다.
 */
export async function setPhaseSchedule(args: {
  seasonId: string;
  rows: { phase: SeasonPhase; startsAt: Date | null }[];
  reason: string;
  actorId: string;
}): Promise<AdminActionResult> {
  const { seasonId, reason, actorId } = args;
  if (reason.trim().length < REASON_MIN) {
    return { ok: false, message: `사유를 ${REASON_MIN}자 이상 적어 주세요.` };
  }

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: {
      phase: true,
      startsAt: true,
      schedules: { select: { id: true, phase: true, startsAt: true, appliedAt: true } },
    },
  });
  if (!season) return { ok: false, message: "시즌을 찾을 수 없습니다." };

  /* 크론과 같은 「지금」으로 잰다 — 개발에서 옮긴 오늘 기준으로 지난 시각을 막는다 */
  const { devNow } = await import("@/lib/dev-clock");
  const plan = planPhaseSchedule({
    before: season.schedules,
    incoming: args.rows,
    current: season.phase,
    now: devNow(),
    kickoff: season.startsAt,
  });
  if (!plan.ok) return { ok: false, message: plan.message };
  const { changed, kickoff } = plan;

  const before = new Map(season.schedules.map((s) => [s.phase, s]));
  const incoming = new Map(args.rows.map((r) => [r.phase, r.startsAt]));
  /* 감사 로그 표의 「from→to」 칸에 그대로 읽히게 — 「racing 10.28 00:00」 */
  const stamp = (at: Date | null | undefined) => (at ? fmtStamp(at) : "비어 있음");
  const label = (phase: SeasonPhase, at: Date | null | undefined) => `${phase} ${stamp(at)}`;
  /* 개막을 같이 옮겼으면 같은 칸에 한 조각 더 — 「racing 09.28 00:00, 개막 09.28 00:00」 */
  const fromLabels = changed.map((p) => label(p, before.get(p)?.startsAt));
  const toLabels = changed.map((p) => label(p, incoming.get(p)));
  if (kickoff) {
    fromLabels.push(`개막 ${stamp(kickoff.from)}`);
    toLabels.push(`개막 ${stamp(kickoff.to)}`);
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const phase of changed) {
        const b = before.get(phase);
        const at = incoming.get(phase) ?? null;
        if (!b) {
          if (at) await tx.seasonSchedule.create({ data: { seasonId, phase, startsAt: at } });
          continue;
        }
        /* 전환 안 된 행만 고친다. 읽은 뒤에 크론이 먼저 전환했으면 0건이다 */
        const done = at
          ? await tx.seasonSchedule.updateMany({
              where: { id: b.id, appliedAt: null },
              data: { startsAt: at },
            })
          : await tx.seasonSchedule.deleteMany({ where: { id: b.id, appliedAt: null } });
        if (done.count === 0) throw new ScheduleRaced();
      }
      if (kickoff) {
        await tx.season.update({ where: { id: seasonId }, data: { startsAt: kickoff.to } });
      }
      await writeAudit(tx, {
        actorId,
        action: "season.schedule",
        targetType: "season",
        targetId: seasonId,
        reason: reason.trim(),
        meta: {
          from: fromLabels.join(", "),
          to: toLabels.join(", "),
          rows: changed.map((p) => ({
            phase: p,
            from: before.get(p)?.startsAt.toISOString() ?? null,
            to: incoming.get(p)?.toISOString() ?? null,
          })),
          ...(kickoff
            ? {
                startsAt: {
                  from: kickoff.from?.toISOString() ?? null,
                  to: kickoff.to.toISOString(),
                },
              }
            : {}),
        },
      });
    });
  } catch (error) {
    if (error instanceof ScheduleRaced) {
      return { ok: false, message: "방금 전환된 행이 있습니다. 새로고침한 뒤 다시 저장해 주세요." };
    }
    /*
      없던 페이즈를 둘이 동시에 만들면 @@unique([seasonId, phase])에 걸린다.
      읽은 뒤에 남이 먼저 저장한 것이라 위와 같은 안내로 돌려준다.
    */
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, message: "방금 다른 저장이 있었습니다. 새로고침한 뒤 다시 저장해 주세요." };
    }
    throw error;
  }
  return { ok: true };
}

/**
 * 스테이지 일정 — 시안 시즌 관리의 날짜 칸(3013행).
 *
 * 다섯 스테이지를 한 번에 받는다. 한 칸씩 저장하면 중간에 순서가 어긋난 일정
 * (s2가 s1보다 먼저 열리는 것)이 저장된 채로 남을 수 있다 — 그래서 다섯 줄을
 * 한 트랜잭션으로 쓰고, 순서가 맞는지 먼저 본다.
 */
export async function setStageDates(args: {
  seasonId: string;
  stages: { stageKey: string; opensAt: Date; closesAt: Date }[];
  reason: string;
  actorId: string;
}): Promise<AdminActionResult> {
  const { seasonId, stages, reason, actorId } = args;
  if (reason.trim().length < REASON_MIN) {
    return { ok: false, message: `사유를 ${REASON_MIN}자 이상 적어 주세요.` };
  }
  const sorted = [...stages].sort((a, b) => a.stageKey.localeCompare(b.stageKey));
  for (const [i, st] of sorted.entries()) {
    if (st.opensAt >= st.closesAt) {
      return { ok: false, message: `${st.stageKey}의 마감이 시작보다 앞섭니다.` };
    }
    const prev = sorted[i - 1];
    if (prev && prev.closesAt > st.opensAt) {
      return { ok: false, message: `${st.stageKey}가 ${prev.stageKey} 마감 전에 열립니다.` };
    }
  }

  const before = await prisma.stage.findMany({
    where: { seasonId },
    select: { id: true, stageKey: true, opensAt: true, closesAt: true },
  });
  const changed = sorted.filter((st) => {
    const b = before.find((x) => x.stageKey === st.stageKey);
    return (
      b &&
      (b.opensAt?.getTime() !== st.opensAt.getTime() ||
        b.closesAt?.getTime() !== st.closesAt.getTime())
    );
  });
  if (changed.length === 0) return { ok: false, message: "바뀐 일정이 없습니다." };

  await prisma.$transaction(async (tx) => {
    for (const st of changed) {
      await tx.stage.updateMany({
        where: { seasonId, stageKey: st.stageKey as never },
        data: { opensAt: st.opensAt, closesAt: st.closesAt },
      });
    }
    await writeAudit(tx, {
      actorId,
      action: "season.update",
      targetType: "season",
      targetId: seasonId,
      reason: reason.trim(),
      meta: {
        stages: changed.map((st) => {
          const b = before.find((x) => x.stageKey === st.stageKey)!;
          return {
            stageKey: st.stageKey,
            from: [b.opensAt?.toISOString() ?? null, b.closesAt?.toISOString() ?? null],
            to: [st.opensAt.toISOString(), st.closesAt.toISOString()],
          };
        }),
      },
    });
  });
  return { ok: true };
}

/**
 * 기능 플래그 하나를 켜거나 끈다 — 시안 `feature_flags` 스위치(3031행).
 *
 * JSONB 통째로 덮어쓰지 않고 읽어서 그 키만 바꾼다. 다른 키(시안에 스위치가 없는
 * 알림·보증금·아카이브)는 그대로 둔다.
 */
export async function setSeasonFlag(args: {
  seasonId: string;
  key: string;
  on: boolean;
  reason: string;
  actorId: string;
}): Promise<AdminActionResult> {
  const { seasonId, key, on, reason, actorId } = args;
  if (reason.trim().length < REASON_MIN) {
    return { ok: false, message: `사유를 ${REASON_MIN}자 이상 적어 주세요.` };
  }
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { featureFlags: true },
  });
  if (!season) return { ok: false, message: "시즌을 찾을 수 없습니다." };
  const flags = (season.featureFlags ?? {}) as Record<string, unknown>;
  const from = flags[key];

  await prisma.$transaction(async (tx) => {
    await tx.season.update({
      where: { id: seasonId },
      data: { featureFlags: { ...flags, [key]: on } as Prisma.InputJsonObject },
    });
    await writeAudit(tx, {
      actorId,
      action: "season.flag",
      targetType: "season",
      targetId: seasonId,
      reason: reason.trim(),
      meta: { key, from: String(from ?? "기본값"), to: String(on) },
    });
  });
  return { ok: true };
}

/** 트랙 추가 — 시안 「+ 트랙 추가」 */
export async function addTrack(args: {
  seasonId: string;
  name: string;
  reason: string;
  actorId: string;
}): Promise<AdminActionResult> {
  const { seasonId, reason, actorId } = args;
  const name = args.name.trim();
  if (!name) return { ok: false, message: "트랙 이름을 적어 주세요." };
  if (name.length > 60) return { ok: false, message: "트랙 이름은 60자까지입니다." };
  if (reason.trim().length < REASON_MIN) {
    return { ok: false, message: `사유를 ${REASON_MIN}자 이상 적어 주세요.` };
  }
  const dup = await prisma.track.findUnique({
    where: { seasonId_name: { seasonId, name } },
    select: { id: true },
  });
  if (dup) return { ok: false, message: "같은 이름의 트랙이 있습니다." };

  await prisma.$transaction(async (tx) => {
    const track = await tx.track.create({ data: { seasonId, name }, select: { id: true } });
    await writeAudit(tx, {
      actorId,
      action: "season.track_add",
      targetType: "season",
      targetId: seasonId,
      reason: reason.trim(),
      meta: { trackId: track.id, name },
    });
  });
  return { ok: true };
}

/** 어뷰징 카드의 세 단계 — 시안 「경고」·「지표 무효화」·「실격」(제16조 ① 비례 적용) */
export type SanctionStep = "warning" | "week_invalidated" | "disqualified";

const STEP_LABEL: Record<SanctionStep, string> = {
  warning: "경고",
  week_invalidated: "지표 무효화",
  disqualified: "실격",
};

/**
 * 플래그를 근거로 제재한다 — 시안 어뷰징 판정 카드의 버튼 셋.
 *
 * 한 트랜잭션에서 넷을 한다: 제재 행 · 플래그 확정(upheld) · 실격이면 참가 상태 ·
 * 감사 로그. 그리고 팀원에게 통지한다(사람마다 한 행).
 *
 * ⚠️ **지표를 여기서 고치지 않는다.** 확정된 플래그가 집계에서 무엇을 빼는지는
 * 채점 시점에 `abuse_flags`를 조인해 정한다(종결본 주석: 캐시 컬럼을 두지 않는다).
 * 여기서 metric_daily를 손대면 두 값이 어긋나고, 소명이 인용됐을 때 되돌릴 근거가 사라진다.
 *
 * ⚠️ 소명 기한을 박지 않는다(`appeal_deadline_at` 비움). 비어 있으면 소명 화면이
 * 「통지 후 5영업일 그날 끝」으로 센다(appeal-view.ts) — 규칙이 한 곳에 남는다.
 * 경고만 시정 기한 24시간을 박는다(제16조 ① 「경고와 시정(24시간)」).
 */
export async function applySanction(args: {
  flagId: string;
  step: SanctionStep;
  /** 제15조 근거. 플래그에 유형이 없으면 운영자가 고른다 */
  reasonKind: SanctionReason;
  reason: string;
  actorId: string;
}): Promise<AdminActionResult> {
  const { flagId, step, reasonKind, actorId } = args;
  const reason = args.reason.trim();
  if (reason.length < REASON_MIN) {
    return { ok: false, message: `사유를 ${REASON_MIN}자 이상 적어 주세요.` };
  }
  const flag = await prisma.abuseFlag.findUnique({
    where: { id: flagId },
    select: { id: true, entryId: true, status: true },
  });
  if (!flag) return { ok: false, message: "플래그를 찾을 수 없습니다." };

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const sanction = await tx.sanction.create({
      data: {
        entryId: flag.entryId,
        stage: step,
        reason: reasonKind,
        detail: reason,
        sourceType: "abuse_flag",
        sourceId: flag.id,
        status: SanctionStatus.applied,
        appliedAt: now,
        decidedBy: actorId,
        ...(step === "warning" ? { correctionDeadline: new Date(now.getTime() + 24 * 3_600_000) } : {}),
      },
      select: { id: true },
    });
    await tx.abuseFlag.update({
      where: { id: flag.id },
      data: {
        kind: reasonKind,
        status: AbuseStatus.upheld,
        resolutionNote: reason,
        reviewedBy: actorId,
      },
    });
    if (step === "disqualified") {
      await tx.entry.update({
        where: { id: flag.entryId },
        data: { status: EntryStatus.disqualified },
      });
    }
    await writeAudit(tx, {
      actorId,
      action: "abuse.sanction",
      targetType: "entry",
      targetId: flag.entryId,
      reason,
      meta: { flagId: flag.id, sanctionId: sanction.id, stage: step, kind: reasonKind },
    });
    const members = await tx.teamMember.findMany({
      where: { team: { entries: { some: { id: flag.entryId } } } },
      select: { userId: true },
    });
    await tx.notification.createMany({
      data: members.map((m) => ({
        userId: m.userId,
        type: "sanction",
        title: `${STEP_LABEL[step]} 통지`,
        body: "제재 사유를 확인하고 소명할 수 있어요.",
        linkUrl: "/dashboard/appeal",
        channel: NotifChannel.inapp,
        sentAt: now,
      })),
    });
  });
  return { ok: true };
}

// ═════════════════════════════════════════════════════════════
// 스폰서 크레딧 — 13 크레딧 센터 설계서 v0.1 7장 「관리 콘솔 P0」
// ═════════════════════════════════════════════════════════════

/*
  혜택 카드 등록·수정, 코드 풀 업로드, 수동 발급.

  ⚠️ 코드 풀 업로드가 여기 있는 이유는 감사 로그다. 스폰서가 준 코드 80개를 누가
  언제 몇 개 올렸는지가 남아야, 나중에 "코드가 모자란다"는 말이 나왔을 때
  우리가 흘린 것인지 스폰서가 덜 준 것인지 가릴 수 있다.

  ⚠️ 수동 발급은 되돌리지 않는다(설계서 4장). 잘못 눌러도 코드는 나간 것으로
  본다 — 되돌릴 수 있게 만들면 "일단 눌러보고 아니면 취소"가 되고, 그 사이
  참가자는 이미 코드를 봤다.
*/

export async function saveCreditOffer(args: {
  seasonId: string;
  kind: CreditKind;
  status: CreditOfferStatus;
  /** 스폰서 이름 — 같은 이름이 있으면 그 스폰서에 잇고, 없으면 만든다(시안 `sponsorName` 칸) */
  sponsorName: string | null;
  unlockEvent: CreditUnlockEvent;
  deliveryMethod: CreditDelivery;
  releaseDate: Date | null;
  validUntil: Date | null;
  inviteUrl: string | null;
  howtoUrl: string | null;
  redeemNote: string | null;
  description: string | null;
  value: string | null;
  fallbackUrl: string | null;
  reason: string;
  actorId: string;
}): Promise<AdminActionResult> {
  const { seasonId, kind, reason, actorId, sponsorName, ...rest } = args;
  if (reason.trim().length < REASON_MIN) {
    return { ok: false, message: `사유를 ${REASON_MIN}자 이상 적어 주세요.` };
  }
  if (sponsorName && sponsorName.length > 80) {
    return { ok: false, message: "스폰서 이름은 80자까지입니다." };
  }

  /*
    활성으로 올리면서 스폰서를 안 붙이면 참가자 화면에 「스폰서 미정」인 채로
    클레임 버튼이 선다. 누르면 줄 것이 없다.
  */
  if (rest.status === CreditOfferStatus.active && !sponsorName) {
    return { ok: false, message: "활성으로 바꾸려면 스폰서를 먼저 적어 주세요." };
  }
  if (
    rest.status === CreditOfferStatus.active &&
    rest.deliveryMethod === CreditDelivery.invite_link &&
    !rest.inviteUrl
  ) {
    return { ok: false, message: "초대 링크 방식은 링크가 있어야 합니다." };
  }

  const before = await prisma.creditOffer.findUnique({
    where: { seasonId_kind: { seasonId, kind } },
    select: { id: true, status: true },
  });

  await prisma.$transaction(async (tx) => {
    const sponsorId = sponsorName
      ? ((
          await tx.sponsor.findFirst({
            where: { name: { equals: sponsorName, mode: "insensitive" } },
            select: { id: true },
          })
        )?.id ??
        (await tx.sponsor.create({ data: { name: sponsorName }, select: { id: true } })).id)
      : null;
    const saved = await tx.creditOffer.upsert({
      where: { seasonId_kind: { seasonId, kind } },
      create: { seasonId, kind, sponsorId, ...rest },
      update: { sponsorId, ...rest },
      select: { id: true },
    });
    await writeAudit(tx, {
      actorId,
      action: before ? "credit.offer_update" : "credit.offer_create",
      targetType: "credit_offer",
      targetId: saved.id,
      reason: reason.trim(),
      meta: { kind, from: before?.status ?? null, to: rest.status },
    });
  });

  return { ok: true };
}

/**
 * 혜택 상태 전환 — 시안 혜택 표의 「상태 전환」(→ `#mdl-reason`).
 * 활성으로 올릴 때의 조건은 `saveCreditOffer`와 같다.
 */
export async function setCreditOfferStatus(args: {
  offerId: string;
  status: CreditOfferStatus;
  reason: string;
  actorId: string;
}): Promise<AdminActionResult> {
  const { offerId, status, reason, actorId } = args;
  if (reason.trim().length < REASON_MIN) {
    return { ok: false, message: `사유를 ${REASON_MIN}자 이상 적어 주세요.` };
  }
  const offer = await prisma.creditOffer.findUnique({
    where: { id: offerId },
    select: { kind: true, status: true, sponsorId: true, deliveryMethod: true, inviteUrl: true },
  });
  if (!offer) return { ok: false, message: "혜택을 찾을 수 없습니다." };
  if (offer.status === status) return { ok: false, message: "이미 그 상태입니다." };
  if (status === CreditOfferStatus.active && !offer.sponsorId) {
    return { ok: false, message: "활성으로 바꾸려면 스폰서를 먼저 적어 주세요." };
  }
  if (
    status === CreditOfferStatus.active &&
    offer.deliveryMethod === CreditDelivery.invite_link &&
    !offer.inviteUrl
  ) {
    return { ok: false, message: "초대 링크 방식은 링크가 있어야 합니다." };
  }
  await prisma.$transaction(async (tx) => {
    await tx.creditOffer.update({ where: { id: offerId }, data: { status } });
    await writeAudit(tx, {
      actorId,
      action: "credit.status",
      targetType: "credit_offer",
      targetId: offerId,
      reason: reason.trim(),
      meta: { kind: offer.kind, from: offer.status, to: status },
    });
  });
  return { ok: true };
}

/**
 * 스폰서 로고 교체 — 시안 편집 카드의 `sponsorLogo` 「교체」.
 * 증빙 저장소(R2, 없으면 dev 로컬)에 올리고 키를 `sponsors.logo_url`에 적는다.
 */
export async function setSponsorLogo(args: {
  offerId: string;
  key: string;
  filename: string;
  actorId: string;
}): Promise<AdminActionResult> {
  const offer = await prisma.creditOffer.findUnique({
    where: { id: args.offerId },
    select: { kind: true, sponsorId: true },
  });
  if (!offer?.sponsorId) return { ok: false, message: "스폰서를 먼저 저장해 주세요." };
  await prisma.$transaction(async (tx) => {
    await tx.sponsor.update({ where: { id: offer.sponsorId! }, data: { logoUrl: args.key } });
    await writeAudit(tx, {
      actorId: args.actorId,
      action: "credit.logo",
      targetType: "credit_offer",
      targetId: args.offerId,
      reason: `스폰서 로고 교체, ${args.filename}`,
      meta: { kind: offer.kind, key: args.key },
    });
  });
  return { ok: true };
}


/**
 * 코드 풀 업로드.
 *
 * 중복은 건너뛴다(`skipDuplicates`). 스폰서가 같은 CSV를 두 번 보내는 일이 잦고,
 * 그때 실패로 되돌리면 새로 온 코드까지 같이 날아간다 — 몇 개가 들어갔는지를
 * 감사 로그에 적는 편이 낫다.
 */
export async function uploadCreditCodes(args: {
  offerId: string;
  codes: string[];
  reason: string;
  actorId: string;
}): Promise<AdminActionResult & { added?: number }> {
  const { offerId, codes, reason, actorId } = args;
  if (reason.trim().length < REASON_MIN) {
    return { ok: false, message: `사유를 ${REASON_MIN}자 이상 적어 주세요.` };
  }

  const clean = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
  if (clean.length === 0) {
    return { ok: false, message: "올릴 코드가 없습니다." };
  }
  if (clean.some((c) => c.length > 120)) {
    return { ok: false, message: "코드 하나가 120자를 넘습니다." };
  }

  const offer = await prisma.creditOffer.findUnique({
    where: { id: offerId },
    select: { id: true, kind: true },
  });
  if (!offer) return { ok: false, message: "혜택을 찾을 수 없습니다." };

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.creditCode.createMany({
      data: clean.map((code) => ({ offerId, code })),
      skipDuplicates: true,
    });
    await writeAudit(tx, {
      actorId,
      action: "credit.codes_upload",
      targetType: "credit_offer",
      targetId: offerId,
      reason: reason.trim(),
      meta: { kind: offer.kind, submitted: clean.length, added: created.count },
    });
    return created.count;
  });

  return { ok: true, added: result };
}

/**
 * 수동 발급 — 시즌1의 정상 경로다. 시안 발급 현황의 「수동 발급」(→ `#mdl-reason`).
 *
 * 자동 발송은 P1이고, 그전까지는 운영자가 코드를 직접 보내고 여기서 상태를
 * 옮긴다(설계서 5장 「시즌 1 수동 대체 경로」). 참가자 화면은 자동일 때와
 * 똑같이 보인다 — 그게 이 경로가 성립하는 조건이다.
 *
 * 보낼 수 있는지는 참가자 「받기」와 **같은 판정**으로 다시 잰다(credits-store
 * `judgeCredit`). 운영 표가 「발급 가능」을 그린 칸만 보낸다 — 실격 팀, 안 열린 카드,
 * 끝난 시즌은 버튼이 없어도 직접 부르면 나갔다(2026-09-30 감사).
 */
export async function deliverCreditManually(args: {
  offerId: string;
  entryId: string;
  reason: string;
  actorId: string;
}): Promise<AdminActionResult> {
  const { offerId, entryId, reason, actorId } = args;
  if (reason.trim().length < REASON_MIN) {
    return { ok: false, message: `사유를 ${REASON_MIN}자 이상 적어 주세요.` };
  }

  const judged = await judgeCredit({ entryId, offerId });
  if (!judged.ok) return { ok: false, message: "혜택을 찾을 수 없습니다." };
  if (judged.state !== "available") {
    return { ok: false, message: MANUAL_REFUSAL[judged.state] ?? "지금은 보낼 수 없는 칸입니다." };
  }

  const out = await prisma.$transaction(async (tx) => {
    const r = await issueCredit(tx, {
      offer: judged.offer,
      entryId,
      via: CreditDeliveredVia.manual,
      now: new Date(),
      due: judged.due,
    });
    if (!r.ok) return r;
    await writeAudit(tx, {
      actorId,
      action: "credit.deliver_manual",
      targetType: "entry",
      targetId: entryId,
      reason: reason.trim(),
      meta: { offerId, kind: judged.offer.kind, entryId, scheduled: r.scheduled },
    });
    return r;
  });
  if (!out.ok) {
    return {
      ok: false,
      message:
        out.code === "SOLD_OUT"
          ? "코드 풀이 비었습니다. CSV로 코드를 먼저 올려 주세요."
          : "이미 발급된 팀입니다.",
    };
  }
  /*
    팀에 알린다 — 코드 풀이면 어느 코드가 나갔는지 운영자도 모른다(풀에서 집는다).
    알리지 않으면 팀은 화면을 다시 열어야 안다.
  */
  if (!out.scheduled) {
    await noticeCreditDelivered({
      offerId: judged.offer.id,
      deliveries: [{ entryId, code: out.code }],
    });
  }
  return { ok: true };
}

/** 「발급 가능」이 아닌 칸을 보내려 할 때 — 운영 표의 배지와 같은 말로 */
const MANUAL_REFUSAL: Partial<Record<CreditCardState, string>> = {
  negotiating: "협의 중인 혜택입니다. 활성으로 바꾼 뒤에 보낼 수 있습니다.",
  locked: "잠긴 칸입니다. 조건을 채우지 않았거나 추가 발급이 멈춘 팀입니다.",
  scheduled: "이미 발급 예정인 팀입니다.",
  delivered: "이미 발급된 팀입니다.",
  confirmed: "이미 발급된 팀입니다.",
  expired: "만료된 칸입니다.",
};

/**
 * 발급 가능 팀에 일괄 발송 — 시안 「발급 가능 팀에 일괄 발송」 → `#mdl-crbatch`.
 *
 * 줄마다 코드 하나를 붙이고(코드 풀) 한 트랜잭션에 감사 로그 한 줄을 남긴다.
 * 코드가 모자라면 붙인 데까지만 하고 멈춘다 — 받은 팀과 못 받은 팀이 갈려 남는다.
 * 메일은 부르는 쪽이 트랜잭션 밖에서 보낸다(돌려주는 `delivered`로).
 */
export async function batchDeliverCredits(args: {
  offerId: string;
  entryIds: string[];
  actorId: string;
}): Promise<
  | { ok: true; delivered: { entryId: string; code: string | null; scheduled: boolean }[]; soldOut: boolean }
  | { ok: false; message: string }
> {
  const offer = await prisma.creditOffer.findUnique({
    where: { id: args.offerId },
    select: { id: true, kind: true, status: true, deliveryMethod: true, releaseDate: true },
  });
  if (!offer) return { ok: false, message: "혜택을 찾을 수 없습니다." };
  if (offer.status !== CreditOfferStatus.active) {
    return { ok: false, message: "활성 혜택만 보낼 수 있습니다." };
  }
  if (args.entryIds.length === 0) return { ok: false, message: "보낼 팀이 없습니다." };

  const { devNow } = await import("@/lib/dev-clock");
  const now = new Date();
  const today = devNow();
  /* 보낼 때인지는 팀마다 다르다 — C1은 그 팀의 게이트 1(credits.ts `releaseDue`) */
  const entries = new Map(
    (
      await prisma.entry.findMany({
        where: { id: { in: args.entryIds } },
        select: { id: true, stage: true, status: true },
      })
    ).map((e) => [e.id, e]),
  );
  return prisma.$transaction(async (tx) => {
    const delivered: { entryId: string; code: string | null; scheduled: boolean }[] = [];
    let soldOut = false;
    for (const entryId of args.entryIds) {
      const entry = entries.get(entryId);
      if (!entry) continue;
      const r = await issueCredit(tx, {
        offer,
        entryId,
        via: CreditDeliveredVia.email,
        now,
        due: releaseDue({
          kind: offer.kind,
          releaseDate: offer.releaseDate,
          gate1Settled: gate1Settled(entry),
          today,
        }),
      });
      /* 그 사이 팀이 직접 받았으면 건너뛴다 — 팀당 1회는 issueCredit이 지킨다 */
      if (!r.ok && r.code === "ALREADY_CLAIMED") continue;
      if (!r.ok) {
        soldOut = true;
        break;
      }
      delivered.push({ entryId, code: r.code, scheduled: r.scheduled });
    }
    await writeAudit(tx, {
      actorId: args.actorId,
      action: "credit.batch",
      targetType: "credit_offer",
      targetId: offer.id,
      reason: "발급 가능 팀 일괄 발송",
      meta: { kind: offer.kind, teams: delivered.length, entryIds: delivered.map((d) => d.entryId), soldOut },
    });
    return { ok: true as const, delivered, soldOut };
  });
}

