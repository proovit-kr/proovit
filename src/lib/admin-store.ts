import {
  AbuseStatus,
  EntryStatus,
  SeasonPhase,
  Prisma,
} from "@/generated/prisma/client";
import { REASON_MIN } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

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
  actorId: string;
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
 */
async function writeAudit(
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
      action: `entry_status:${status}`,
      targetType: "entry",
      targetId: entryId,
      reason: reason.trim(),
      /* 되돌릴 때 필요한 것은 "무엇에서 무엇으로"다 */
      meta: { from: entry.status, to: status },
    });
  });

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
      action: `season_phase:${phase}`,
      targetType: "season",
      targetId: seasonId,
      reason: reason.trim(),
      meta: { from: season.phase, to: phase },
    });
  });

  return { ok: true };
}

/**
 * 어뷰징 플래그 판정 — 확정(upheld) / 취소(overturned).
 *
 * ⚠️ **지표를 여기서 고치지 않는다.** 확정된 플래그가 집계에서 무엇을 빼는지는
 * 채점 시점에 `abuse_flags`를 조인해 정한다(종결본 주석: 캐시 컬럼을 두지 않는다).
 * 판정할 때 metric_daily를 손대면 두 값이 어긋나고, 나중에 소명이 인용됐을 때
 * 되돌릴 근거가 사라진다.
 *
 * `resolution_note`는 스키마가 「운영자 처리 사유(필수 기록)」로 잡아둔 칸이라
 * 감사 로그의 reason과 같은 값을 넣는다 — 표를 옮겨 다니지 않고도 읽히게.
 */
export async function resolveAbuseFlag(args: {
  flagId: string;
  status: AbuseStatus;
  reason: string;
  actorId: string;
  /** 확정 시 조정한 유효 방문 수. 비우면 조정 없음 */
  adjustedVisitors?: number | null;
}): Promise<AdminActionResult> {
  const { flagId, status, reason, actorId, adjustedVisitors } = args;
  if (reason.trim().length < REASON_MIN) {
    return { ok: false, message: `사유를 ${REASON_MIN}자 이상 적어 주세요.` };
  }
  if (status !== AbuseStatus.upheld && status !== AbuseStatus.overturned) {
    return { ok: false, message: "확정 또는 취소만 할 수 있습니다." };
  }

  const flag = await prisma.abuseFlag.findUnique({
    where: { id: flagId },
    select: { status: true, entryId: true },
  });
  if (!flag) return { ok: false, message: "플래그를 찾을 수 없습니다." };
  if (flag.status === status) return { ok: false, message: "이미 그 상태입니다." };

  await prisma.$transaction(async (tx) => {
    await tx.abuseFlag.update({
      where: { id: flagId },
      data: {
        status,
        resolutionNote: reason.trim(),
        reviewedBy: actorId,
        ...(adjustedVisitors === undefined ? {} : { adjustedVisitors }),
      },
    });
    await writeAudit(tx, {
      actorId,
      action: `abuse_flag:${status}`,
      targetType: "abuse_flag",
      targetId: flagId,
      reason: reason.trim(),
      meta: { from: flag.status, to: status, entryId: flag.entryId },
    });
  });

  return { ok: true };
}
