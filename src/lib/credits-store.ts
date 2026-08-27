import {
  CreditClaimStatus,
  CreditDelivery,
  CreditDeliveredVia,
  CreditKind,
  CreditOfferStatus,
  CreditStatus,
  ConsentType,
  EntryStage,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { stageAtLeast } from "@/lib/access-policy";
import {
  CREDIT_CARDS,
  type CreditCardState,
  type CreditFailureCode,
  type FallbackItem,
  type UnlockProgress,
  creditCardState,
  isAwardCard,
  isUnlocked,
  parseFallbackItems,
} from "@/lib/credits";
import { prisma } from "@/lib/prisma";

/*
  혜택·크레딧 저장. **서버 전용이다** — 규칙은 credits.ts에 있다.

  ⚠️ 이 파일은 **코드를 만들지 않는다.** 코드 풀은 스폰서가 생성해 준 것을 운영자가
  올려둔 것이고(13 설계서 2장 「스폰서 직접 지급 권장」), 우리가 하는 일은 그중
  하나를 팀에 붙여 주고 붙였다는 사실을 기록하는 것뿐이다. 우리가 코드를 만들면
  그 순간 크레딧 잔액을 우리가 보유하는 셈이 되는데, 현금 거래가 불가한 지금
  그건 할 수 없는 일이다.

  ⚠️ **되돌림이 없다**(설계서 4장 전이 규칙). 코드는 소비되면 돌아오지 않는다.
  유일한 예외가 「적용했어요」 체크로, 그건 참가자 본인의 표시라 껐다 켰다 한다.
*/

// ═════════════════════════════════════════════════════════════
// 언락 판정에 쓸 재료 모으기
// ═════════════════════════════════════════════════════════════

/**
 * 팀이 지금까지 일으킨 언락 이벤트 넷.
 *
 * ⚠️ 넷을 각각 다른 곳에서 읽는다 — 진도 하나로 접으면 틀린다.
 *
 *   s1 제출     `submissions`의 s1이 draft를 벗어났는가. 진도(stage)는 게이트를
 *               통과해야 오르므로 "냈다"를 진도로 판정할 수 없다.
 *   게이트 1 통과 게이트는 s2다(access-policy GATE_STAGES). 통과하면 진도가 s3으로
 *               전진하므로 진도로 읽는다 — 전진 자체가 통과의 근거다.
 *   배포 검증    `hostnames.ownership_verified_at`. 진도가 s3이어도 검증은 안 끝나
 *               있을 수 있다. 지표를 세는 근거가 이 값이라 여기서도 같은 값을 쓴다.
 *   최종 확정    시상 기록이 생겼는가. 상금 규정이 붙는 카드라 「심사가 끝났다」가
 *               아니라 「이 팀이 받는다」가 조건이다.
 */
export async function loadUnlockProgress(
  entryId: string,
  stage: EntryStage,
): Promise<UnlockProgress> {
  const [s1, hostname, award] = await Promise.all([
    prisma.submission.findFirst({
      where: {
        entryId,
        stageKey: StageKey.s1,
        status: { in: [SubmissionStatus.submitted, SubmissionStatus.locked] },
      },
      select: { id: true },
    }),
    prisma.hostname.findUnique({
      where: { entryId },
      select: { ownershipVerifiedAt: true },
    }),
    prisma.award.findFirst({
      where: { entryId, awardedAt: { not: null } },
      select: { id: true },
    }),
  ]);

  return {
    s1Submitted: s1 !== null,
    gate1Passed: stageAtLeast(stage, EntryStage.s3),
    deployVerified: hostname?.ownershipVerifiedAt != null,
    finalConfirmed: award !== null,
  };
}

// ═════════════════════════════════════════════════════════════
// 참가자 화면 — 혜택과 크레딧
// ═════════════════════════════════════════════════════════════

export type CreditCardView = {
  kind: CreditKind;
  code: string;
  title: string;
  /** 참가자에게 보여줄 언락 조건 문구 */
  condition: string;
  /** 조건을 채웠는가. 협의 중 카드도 이 값은 따로 보여 준다 */
  unlocked: boolean;
  state: CreditCardState;

  /** 카드가 아직 DB에 없으면 null. 그때는 협의 중으로 그린다 */
  offerId: string | null;
  sponsorName: string | null;
  sponsorLogoUrl: string | null;
  description: string | null;
  /** "$75 상당" 같은 표기. 계산에 쓰지 않는다 */
  value: string | null;
  releaseDate: Date | null;
  validUntil: Date | null;
  deliveryMethod: CreditDelivery | null;

  /** 폴백, 0원 스타트 스택 */
  fallbackUrl: string | null;
  fallbackItems: FallbackItem[];

  /** 발급 완료 이후에만 채워진다 */
  code_: { value: string; masked: boolean } | null;
  deliveredAt: Date | null;
  confirmedAt: Date | null;
  unlockedAt: Date | null;
};

export type CreditCenterView = {
  cards: CreditCardView[];
  /** 열린 혜택 수. 「n/4」의 n */
  opened: number;
  /** 카드 총수. 4장 고정이지만 화면이 상수를 다시 쓰지 않게 같이 준다 */
  total: number;
};

/**
 * 혜택 탭 한 판.
 *
 * 카드 4장은 **항상** 4장이다. DB에 행이 없어도 자리를 비우지 않는다 —
 * 제휴가 0건이어도 혜택 탭은 열린다는 것이 설계서 2장의 전제고, 그때 화면에
 * 서는 것이 협의 중 카드와 폴백이다.
 */
export async function loadCreditCenter(args: {
  entryId: string;
  seasonId: string;
  stage: EntryStage;
}): Promise<CreditCenterView> {
  const { entryId, seasonId, stage } = args;

  const [offers, claims, progress] = await Promise.all([
    prisma.creditOffer.findMany({
      where: { seasonId },
      select: {
        id: true,
        kind: true,
        status: true,
        description: true,
        value: true,
        releaseDate: true,
        validUntil: true,
        deliveryMethod: true,
        inviteUrl: true,
        fallbackUrl: true,
        fallbackItems: true,
        sponsor: { select: { name: true, logoUrl: true } },
      },
    }),
    prisma.creditClaim.findMany({
      where: { entryId },
      select: {
        offerId: true,
        status: true,
        unlockedAt: true,
        deliveredAt: true,
        confirmedAt: true,
        creditCode: { select: { code: true } },
      },
    }),
    loadUnlockProgress(entryId, stage),
  ]);

  const offerByKind = new Map(offers.map((o) => [o.kind, o]));
  const claimByOffer = new Map(claims.map((c) => [c.offerId, c]));

  const cards = CREDIT_CARDS.map((spec): CreditCardView => {
    const offer = offerByKind.get(spec.kind) ?? null;
    const claim = offer ? (claimByOffer.get(offer.id) ?? null) : null;
    const unlocked = isUnlocked(spec.unlockEvent, progress);

    /*
      카드가 DB에 없으면 협의 중으로 본다. 운영자가 아직 안 만든 것과 만들었는데
      스폰서가 안 붙은 것은 참가자에게 같은 상황이다 — 둘 다 "지금은 폴백"이다.
    */
    const offerStatus = offer?.status ?? CreditOfferStatus.negotiating;
    const state = creditCardState({
      kind: spec.kind,
      offerStatus,
      claimStatus: claim?.status ?? null,
      unlocked,
    });

    /*
      링크형은 코드가 아니라 초대 링크를 준다. 코드 풀과 자리를 같이 쓰는 이유는
      참가자가 하는 일이 같아서다 — 복사해서 스폰서 쪽에 붙여넣는 것.
    */
    const delivered = state === "delivered" || state === "confirmed";
    const codeValue = claim?.creditCode?.code ?? offer?.inviteUrl ?? null;

    return {
      kind: spec.kind,
      code: spec.code,
      title: spec.title,
      condition: spec.condition,
      unlocked,
      state,
      offerId: offer?.id ?? null,
      sponsorName: offer?.sponsor?.name ?? null,
      sponsorLogoUrl: offer?.sponsor?.logoUrl ?? null,
      description: offer?.description ?? null,
      value: offer?.value ?? null,
      releaseDate: offer?.releaseDate ?? null,
      validUntil: offer?.validUntil ?? null,
      deliveryMethod: offer?.deliveryMethod ?? null,
      fallbackUrl: offer?.fallbackUrl ?? null,
      fallbackItems: parseFallbackItems(offer?.fallbackItems),
      code_:
        delivered && codeValue
          ? { value: codeValue, masked: state === "confirmed" }
          : null,
      deliveredAt: claim?.deliveredAt ?? null,
      confirmedAt: claim?.confirmedAt ?? null,
      unlockedAt: claim?.unlockedAt ?? null,
    };
  });

  return {
    cards,
    opened: cards.filter((c) => isOpened(c.state)).length,
    total: cards.length,
  };
}

function isOpened(state: CreditCardState): boolean {
  return (
    state === "available" ||
    state === "scheduled" ||
    state === "delivered" ||
    state === "confirmed" ||
    state === "awarded"
  );
}

export type CreditResult = { ok: true } | { ok: false; code: CreditFailureCode };

/**
 * 크레딧 받기.
 *
 * 코드 하나를 팀에 붙이고 소비 표시를 한다. **트랜잭션이 필수다** — 두 팀이
 * 같은 순간에 누르면 같은 코드가 두 번 나갈 수 있고, 그건 스폰서에게 우리가
 * 사과할 일이다. 코드 선택에 `updateMany`+조건을 쓰는 이유가 그것이다:
 * "아직 issued인 그 행"을 갱신에 성공한 쪽만 가져간다.
 *
 * 시즌1은 수동 경로로도 같은 결과가 나와야 한다(설계서 2장 「수동 대체 가능」).
 * 그래서 발송 자체는 여기서 하지 않는다 — 상태만 옮기고 실제 이메일은 운영자가
 * 보내거나 P1에서 붙는다. 상태와 발송을 묶어 두면 메일이 안 나갔을 때
 * 되돌릴 수 없는 상태만 남는다.
 */
export async function claimCredit(args: {
  entryId: string;
  offerId: string;
  progress: UnlockProgress;
}): Promise<CreditResult> {
  const { entryId, offerId, progress } = args;

  const offer = await prisma.creditOffer.findUnique({
    where: { id: offerId },
    select: {
      id: true,
      kind: true,
      status: true,
      unlockEvent: true,
      deliveryMethod: true,
      releaseDate: true,
    },
  });
  if (!offer) return { ok: false, code: "NOT_FOUND" };

  /* 시상 카드는 여기서 받는 것이 아니다 — 시상 절차가 따로 간다 */
  if (isAwardCard(offer.kind)) return { ok: false, code: "LOCKED" };
  if (offer.status === CreditOfferStatus.negotiating) {
    return { ok: false, code: "NEGOTIATING" };
  }
  if (offer.status === CreditOfferStatus.ended) {
    return { ok: false, code: "ENDED" };
  }
  if (!isUnlocked(offer.unlockEvent, progress)) {
    return { ok: false, code: "LOCKED" };
  }

  const existing = await prisma.creditClaim.findUnique({
    where: { offerId_entryId: { offerId, entryId } },
    select: { status: true },
  });
  if (existing && existing.status !== CreditClaimStatus.available) {
    return { ok: false, code: "ALREADY_CLAIMED" };
  }

  /*
    배포 예정일이 남았으면 코드를 아직 태우지 않는다.
    유효기간이 지급 시점부터 도는 탓이다 — 미리 주면 참가자가 손해를 본다
    (설계서 2장 「빌드 시작 시점 지급」).
  */
  const now = new Date();
  const scheduled = offer.releaseDate != null && offer.releaseDate > now;

  const usesPool = offer.deliveryMethod === CreditDelivery.code_pool;

  return prisma.$transaction(async (tx) => {
    let creditCodeId: string | null = null;

    if (!scheduled && usesPool) {
      const candidate = await tx.creditCode.findFirst({
        where: { offerId, status: CreditStatus.issued },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!candidate) return { ok: false as const, code: "SOLD_OUT" as const };

      /*
        조건부 갱신이 곧 잠금이다. 같은 행을 노린 다른 트랜잭션은 count 0을 받고
        물러난다 — SELECT ... FOR UPDATE 없이도 이중 소비가 막힌다.
      */
      const taken = await tx.creditCode.updateMany({
        where: { id: candidate.id, status: CreditStatus.issued },
        data: { status: CreditStatus.claimed },
      });
      if (taken.count === 0) return { ok: false as const, code: "SOLD_OUT" as const };
      creditCodeId = candidate.id;
    }

    const status = scheduled
      ? CreditClaimStatus.scheduled
      : CreditClaimStatus.delivered;

    await tx.creditClaim.upsert({
      where: { offerId_entryId: { offerId, entryId } },
      create: {
        offerId,
        entryId,
        status,
        claimedAt: now,
        ...(scheduled ? {} : { deliveredAt: now }),
        ...(creditCodeId ? { creditCodeId } : {}),
        /* 시즌1 P0는 운영자가 보낸다. 자동 발송이 붙으면 email로 바뀐다 */
        deliveredVia: scheduled ? null : CreditDeliveredVia.manual,
      },
      update: {
        status,
        claimedAt: now,
        ...(scheduled ? {} : { deliveredAt: now }),
        ...(creditCodeId ? { creditCodeId } : {}),
        deliveredVia: scheduled ? null : CreditDeliveredVia.manual,
      },
    });

    return { ok: true as const };
  });
}

/**
 * 「적용했어요」 체크.
 *
 * 되돌림 없음 규칙의 유일한 예외다 — 이건 우리가 판정한 상태가 아니라 참가자
 * 본인의 표시라서, 잘못 눌렀으면 되돌릴 수 있어야 한다. 스폰서 측 발급 확인이
 * 붙으면 그쪽은 운영자만 끌 수 있는 값으로 따로 들어온다.
 */
export async function setCreditApplied(args: {
  entryId: string;
  offerId: string;
  applied: boolean;
}): Promise<CreditResult> {
  const { entryId, offerId, applied } = args;

  const claim = await prisma.creditClaim.findUnique({
    where: { offerId_entryId: { offerId, entryId } },
    select: { status: true },
  });
  if (!claim) return { ok: false, code: "NOT_FOUND" };
  if (
    claim.status !== CreditClaimStatus.delivered &&
    claim.status !== CreditClaimStatus.confirmed
  ) {
    return { ok: false, code: "LOCKED" };
  }

  await prisma.creditClaim.update({
    where: { offerId_entryId: { offerId, entryId } },
    data: applied
      ? { status: CreditClaimStatus.confirmed, confirmedAt: new Date() }
      : { status: CreditClaimStatus.delivered, confirmedAt: null },
  });
  return { ok: true };
}

// ═════════════════════════════════════════════════════════════
// 운영자 화면 — 스폰서 크레딧
// ═════════════════════════════════════════════════════════════

export type AdminOfferRow = {
  id: string;
  kind: CreditKind;
  code: string;
  title: string;
  status: CreditOfferStatus;
  sponsorId: string | null;
  sponsorName: string | null;
  unlockEvent: string;
  deliveryMethod: CreditDelivery;
  releaseDate: Date | null;
  validUntil: Date | null;
  description: string | null;
  value: string | null;
  inviteUrl: string | null;
  fallbackUrl: string | null;
  fallbackItems: FallbackItem[];
  /** 코드 풀. 링크형·수동형이면 total 0이다 */
  pool: { remaining: number; total: number };
};

export type AdminClaimCell = {
  kind: CreditKind;
  status: CreditClaimStatus | null;
  /** 카드가 협의 중인가. 「협의 중, 열림」을 가르는 값 */
  negotiating: boolean;
};

export type AdminClaimRow = {
  entryId: string;
  teamName: string;
  ideaTitle: string;
  stage: EntryStage;
  status: string;
  cells: AdminClaimCell[];
  lastDeliveredAt: Date | null;
  /** 스폰서 정보 제공 선택 동의. 없으면 이메일 명단에 넣지 않는다 */
  sponsorConsent: boolean;
};

export type AdminCreditSummary = {
  activeOffers: number;
  totalOffers: number;
  codesRemaining: number;
  deliveredTeams: number;
  confirmedTeams: number;
};

export type AdminCreditConsole = {
  summary: AdminCreditSummary;
  offers: AdminOfferRow[];
  claims: AdminClaimRow[];
};

/**
 * 스폰서 크레딧 콘솔 한 판 — 혜택 설정 · 팀별 발급 현황.
 *
 * 발송 이력은 감사 로그가 정본이라 여기서 만들지 않는다(admin-read의 로그 조회를
 * 그대로 쓴다). 같은 사실을 두 곳에 적으면 둘이 갈라진다.
 */
export async function loadAdminCreditConsole(
  seasonId: string,
): Promise<AdminCreditConsole> {
  const [offers, entries] = await Promise.all([
    prisma.creditOffer.findMany({
      where: { seasonId },
      select: {
        id: true,
        kind: true,
        status: true,
        unlockEvent: true,
        deliveryMethod: true,
        releaseDate: true,
        validUntil: true,
        description: true,
        value: true,
        inviteUrl: true,
        fallbackUrl: true,
        fallbackItems: true,
        sponsorId: true,
        sponsor: { select: { name: true } },
        codes: { select: { status: true } },
      },
    }),
    prisma.entry.findMany({
      where: { seasonId },
      orderBy: [{ stage: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        stage: true,
        status: true,
        ideaTitle: true,
        team: { select: { name: true } },
        creditClaims: {
          select: {
            offerId: true,
            status: true,
            deliveredAt: true,
          },
        },
        consents: { select: { type: true, granted: true } },
      },
    }),
  ]);

  const byId = new Map(offers.map((o) => [o.id, o]));

  const offerRows: AdminOfferRow[] = CREDIT_CARDS.flatMap((spec) => {
    const offer = offers.find((o) => o.kind === spec.kind);
    if (!offer) return [];
    const total = offer.codes.length;
    const remaining = offer.codes.filter(
      (c) => c.status === CreditStatus.issued,
    ).length;
    return [
      {
        id: offer.id,
        kind: offer.kind,
        code: spec.code,
        title: spec.title,
        status: offer.status,
        sponsorId: offer.sponsorId,
        sponsorName: offer.sponsor?.name ?? null,
        unlockEvent: offer.unlockEvent,
        deliveryMethod: offer.deliveryMethod,
        releaseDate: offer.releaseDate,
        validUntil: offer.validUntil,
        description: offer.description,
        value: offer.value,
        inviteUrl: offer.inviteUrl,
        fallbackUrl: offer.fallbackUrl,
        fallbackItems: parseFallbackItems(offer.fallbackItems),
        pool: { remaining, total },
      },
    ];
  });

  /* 시상 카드는 클레임 표에 세로줄을 만들지 않는다 — 시상 절차가 따로 간다 */
  const claimKinds = CREDIT_CARDS.filter((c) => !isAwardCard(c.kind));

  const claimRows: AdminClaimRow[] = entries.map((entry) => {
    const claimByOffer = new Map(
      entry.creditClaims.map((c) => [c.offerId, c]),
    );
    const delivered = entry.creditClaims
      .map((c) => c.deliveredAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => b.getTime() - a.getTime());

    return {
      entryId: entry.id,
      teamName: entry.team.name,
      ideaTitle: entry.ideaTitle,
      stage: entry.stage,
      status: entry.status,
      cells: claimKinds.map((spec) => {
        const offer = offers.find((o) => o.kind === spec.kind);
        const claim = offer ? claimByOffer.get(offer.id) : undefined;
        return {
          kind: spec.kind,
          status: claim?.status ?? null,
          negotiating:
            (offer?.status ?? CreditOfferStatus.negotiating) ===
            CreditOfferStatus.negotiating,
        };
      }),
      lastDeliveredAt: delivered[0] ?? null,
      /*
        스폰서에게 넘길 수 있는 팀인가. 참가 신청 때 받은 선택 동의가 근거고,
        없으면 이메일 명단 방식에서 제외한다(설계서 8장 · 개인정보처리방침).
      */
      sponsorConsent: entry.consents.some(
        (c) => c.type === ConsentType.sponsor_share && c.granted,
      ),
    };
  });

  const deliveredTeams = new Set<string>();
  const confirmedTeams = new Set<string>();
  for (const entry of entries) {
    for (const claim of entry.creditClaims) {
      if (!byId.has(claim.offerId)) continue;
      if (claim.status === CreditClaimStatus.delivered) {
        deliveredTeams.add(entry.id);
      }
      if (claim.status === CreditClaimStatus.confirmed) {
        confirmedTeams.add(entry.id);
        deliveredTeams.add(entry.id);
      }
    }
  }

  return {
    summary: {
      activeOffers: offerRows.filter(
        (o) => o.status === CreditOfferStatus.active,
      ).length,
      totalOffers: CREDIT_CARDS.length,
      codesRemaining: offerRows.reduce((sum, o) => sum + o.pool.remaining, 0),
      deliveredTeams: deliveredTeams.size,
      confirmedTeams: confirmedTeams.size,
    },
    offers: offerRows,
    claims: claimRows,
  };
}
