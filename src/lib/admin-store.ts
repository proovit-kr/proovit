import {
  AbuseStatus,
  CreditClaimStatus,
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
  sponsorId: string | null;
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
  const { seasonId, kind, reason, actorId, ...rest } = args;
  if (reason.trim().length < REASON_MIN) {
    return { ok: false, message: `사유를 ${REASON_MIN}자 이상 적어 주세요.` };
  }

  /*
    활성으로 올리면서 스폰서를 안 붙이면 참가자 화면에 「스폰서 미정」인 채로
    클레임 버튼이 선다. 누르면 줄 것이 없다.
  */
  if (rest.status === CreditOfferStatus.active && !rest.sponsorId) {
    return {
      ok: false,
      message: "활성으로 바꾸려면 스폰서를 먼저 지정해 주세요.",
    };
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
    const saved = await tx.creditOffer.upsert({
      where: { seasonId_kind: { seasonId, kind } },
      create: { seasonId, kind, ...rest },
      update: rest,
      select: { id: true },
    });
    await writeAudit(tx, {
      actorId,
      action: before ? "credit_offer:update" : "credit_offer:create",
      targetType: "credit_offer",
      targetId: saved.id,
      reason: reason.trim(),
      meta: { kind, from: before?.status ?? null, to: rest.status },
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
    select: { id: true },
  });
  if (!offer) return { ok: false, message: "혜택을 찾을 수 없습니다." };

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.creditCode.createMany({
      data: clean.map((code) => ({ offerId, code })),
      skipDuplicates: true,
    });
    await writeAudit(tx, {
      actorId,
      action: "credit_codes:upload",
      targetType: "credit_offer",
      targetId: offerId,
      reason: reason.trim(),
      meta: { submitted: clean.length, added: created.count },
    });
    return created.count;
  });

  return { ok: true, added: result };
}

/**
 * 수동 발급 — 시즌1의 정상 경로다.
 *
 * 자동 발송은 P1이고, 그전까지는 운영자가 코드를 직접 보내고 여기서 상태를
 * 옮긴다(설계서 5장 「시즌 1 수동 대체 경로」). 참가자 화면은 자동일 때와
 * 똑같이 보인다 — 그게 이 경로가 성립하는 조건이다.
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

  const claim = await prisma.creditClaim.findUnique({
    where: { offerId_entryId: { offerId, entryId } },
    select: { status: true },
  });
  if (
    claim &&
    claim.status !== CreditClaimStatus.available &&
    claim.status !== CreditClaimStatus.scheduled
  ) {
    return { ok: false, message: "이미 발급된 팀입니다." };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.creditClaim.upsert({
      where: { offerId_entryId: { offerId, entryId } },
      create: {
        offerId,
        entryId,
        status: CreditClaimStatus.delivered,
        claimedAt: now,
        deliveredAt: now,
        deliveredVia: CreditDeliveredVia.manual,
      },
      update: {
        status: CreditClaimStatus.delivered,
        deliveredAt: now,
        deliveredVia: CreditDeliveredVia.manual,
      },
    });
    await writeAudit(tx, {
      actorId,
      action: "credit_claim:deliver_manual",
      targetType: "credit_claim",
      targetId: `${offerId}:${entryId}`,
      reason: reason.trim(),
      meta: { offerId, entryId, from: claim?.status ?? null },
    });
  });

  return { ok: true };
}
