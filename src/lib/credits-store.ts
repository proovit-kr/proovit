import type { Prisma } from "@/generated/prisma/client";
import {
  CreditClaimStatus,
  CreditDelivery,
  CreditDeliveredVia,
  CreditKind,
  CreditOfferStatus,
  CreditStatus,
  CreditUnlockEvent,
  ConsentType,
  DeployStatus,
  EntryStage,
  EntryStatus,
  JudgmentResult,
  NotifChannel,
  SeasonPhase,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { stageAtLeast } from "@/lib/access-policy";
import {
  CLAIM_STATUS_LABEL,
  CREDIT_CARDS,
  CREDIT_CARD_BY_KIND,
  type CreditCardState,
  type CreditFailureCode,
  type CreditSeason,
  type FallbackItem,
  type UnlockProgress,
  awaitingManualCode,
  claimRefusal,
  creditCardState,
  creditTargetLabel,
  creditLapsed,
  releaseDue,
  creditSeason,
  isAwardCard,
  isOpenedCard,
  isUnlocked,
  parseFallbackItems,
  unlockedAt,
} from "@/lib/credits";
import { devNow } from "@/lib/dev-clock";
import { parseFeatureFlags } from "@/lib/feature-flags";
import { sendCreditMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { notDeployed } from "@/lib/race";

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
 * 팀이 지금까지 일으킨 언락 이벤트 넷과 그 때.
 *
 * ⚠️ 넷을 각각 다른 곳에서 읽는다 — 진도 하나로 접으면 틀린다.
 *
 *   s1 제출     `submissions`의 s1을 **낸 적이 있는가**(그 `submitted_at`). 진도
 *               (stage)는 게이트를 통과해야 오르므로 "냈다"를 진도로 판정할 수 없다.
 *               상태(submitted)로 읽지 않는다 — 낸 뒤 임시 저장하면 draft로 돌아가는데,
 *               제출 저장소는 그때도 `submitted_at`을 지킨다(「임시 저장은 제출 기록을
 *               지우지 않는다」). 상태로 읽던 때는 받기 전의 C1이 다시 잠겼다.
 *   게이트 1 통과 게이트는 s2다(access-policy GATE_STAGES). 통과하면 진도가 s3으로
 *               전진하므로 진도로 읽는다 — 전진 자체가 통과의 근거다. 때는 s2의
 *               **마지막** 판정이고, 그게 통과가 아니면 번복된 것이다(판정은 새 행으로
 *               쌓이고 진도는 뒤로 안 내린다, judging-store). 판정 행이 아예 없으면
 *               때를 모른 채 연다.
 *   배포 검증    레이스를 시작했고(s3 제출) 측정 주소가 확인됐다 — race.ts
 *               `notDeployed`의 반대. 리더보드·참가작 상세와 같은 정의다. 측정 연동만
 *               보던 때는 온보딩에서 검증을 끝낸 팀이 모집 중부터 C3을 받을 수 있었다
 *               (2026-09-30 감사). 때는 둘 중 늦은 쪽이다.
 *   최종 확정    시상 기록이 생겼는가(`awarded_at`). 상금 규정이 붙는 카드라 「심사가
 *               끝났다」가 아니라 「이 팀이 받는다」가 조건이다.
 */
export async function loadUnlockProgress(entryId: string): Promise<UnlockProgress> {
  const [entry, s1, gate, award] = await Promise.all([
    prisma.entry.findUniqueOrThrow({
      where: { id: entryId },
      select: {
        stage: true,
        raceStartedAt: true,
        hostname: { select: { deployStatus: true, ownershipVerifiedAt: true } },
      },
    }),
    prisma.submission.findFirst({
      where: {
        entryId,
        stageKey: StageKey.s1,
        OR: [
          { submittedAt: { not: null } },
          { status: { in: [SubmissionStatus.submitted, SubmissionStatus.locked] } },
        ],
      },
      select: { submittedAt: true, updatedAt: true },
    }),
    prisma.judgment.findFirst({
      where: { submission: { entryId, stageKey: StageKey.s2 } },
      orderBy: { judgedAt: "desc" },
      select: { result: true, judgedAt: true },
    }),
    prisma.award.findFirst({
      where: { entryId, awardedAt: { not: null } },
      select: { awardedAt: true },
    }),
  ]);

  return {
    s1Submitted: s1 ? (s1.submittedAt ?? s1.updatedAt) : null,
    gate1Passed: gate1PassedAt(entry.stage, gate),
    deployVerified: deployVerifiedAt(entry, devNow()),
    finalConfirmed: award?.awardedAt ?? null,
  };
}

/** 게이트 1을 넘은 때. 진도가 s3에 못 닿았거나 마지막 판정이 통과가 아니면 null */
export function gate1PassedAt(
  stage: EntryStage,
  last: { result: JudgmentResult; judgedAt: Date } | null,
): Date | null {
  if (!stageAtLeast(stage, EntryStage.s3)) return null;
  /* 때를 모르는 사건은 EPOCH — 「열렸다」는 사실만 남기고 날짜는 안 그린다 */
  if (!last) return UNKNOWN_AT;
  return last.result === JudgmentResult.pass ? last.judgedAt : null;
}

/** 배포가 검증된 때 — 레이스 시작과 주소 확인 중 늦은 쪽. 미배포면 null */
export function deployVerifiedAt(
  entry: {
    raceStartedAt: Date | null;
    hostname: { deployStatus: DeployStatus; ownershipVerifiedAt: Date | null } | null;
  },
  now: Date,
): Date | null {
  if (notDeployed(entry, now)) return null;
  const started = entry.raceStartedAt as Date;
  const verified = entry.hostname?.ownershipVerifiedAt as Date;
  return started > verified ? started : verified;
}

/**
 * 게이트 1이 가려졌는가 — 통과해 진도가 s3 이상이거나, 탈락했다. C1을 보내는 때다
 * (credits.ts `releaseDue`). 실격·포기 팀은 가려진 것으로 보지 않는다 — 보내지 않는다.
 */
export function gate1Settled(entry: { stage: EntryStage; status: EntryStatus }): boolean {
  if (entry.status === EntryStatus.eliminated) return true;
  return entry.status === EntryStatus.active && stageAtLeast(entry.stage, EntryStage.s3);
}

/** 일어났지만 언제인지 모르는 사건의 자리. 화면은 이 날짜를 안 그린다 */
export const UNKNOWN_AT = new Date(0);

/** 화면에 그릴 수 있는 때인가 */
export function knownAt(at: Date | null): Date | null {
  return at && at.getTime() > 0 ? at : null;
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
  unlockEvent: CreditUnlockEvent;
  /** 조건을 채웠는가. 협의 중 카드도 이 값은 따로 보여 준다 */
  unlocked: boolean;
  state: CreditCardState;

  /** 조건이 채워진 때. 모르면 null(연 것은 `unlocked`가 말한다) */
  unlockedAt: Date | null;

  /** 카드가 아직 DB에 없으면 null. 그때는 협의 중으로 그린다 */
  offerId: string | null;
  sponsorName: string | null;
  /** 워드마크 칸의 글자(시안 「R」·「▲」). 없으면 이름 첫 글자 */
  sponsorMark: string | null;
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
  /** 「적용 방법」 링크와 발송 줄의 적용 안내(시안 `how`) */
  howtoUrl: string | null;
  redeemNote: string | null;

  /** 발급 완료 이후에만 채워진다 */
  code_: { value: string; masked: boolean } | null;
  deliveredAt: Date | null;
  confirmedAt: Date | null;
};

export type CreditCenterView = {
  season: CreditSeason;
  cards: CreditCardView[];
  /** 열린 혜택 수. 「n/4」의 n */
  opened: number;
  /** 카드 총수. 4장 고정이지만 화면이 상수를 다시 쓰지 않게 같이 준다 */
  total: number;
  /** 시상 기록. 시안 ⑦의 「🏆 우수상 이상 3팀 · 확정 11.03」 */
  award: { label: string; at: Date | null } | null;
  /** 이 팀의 빌드 시작일 — 게이트 1을 통과한 때. C1의 「지급 시점」이 이 날짜다 */
  buildStartAt: Date | null;
};

/**
 * 혜택 탭 한 판.
 *
 * 카드 4장은 **항상** 4장이다. DB에 행이 없어도 자리를 비우지 않는다 — 운영자가
 * 아직 안 만든 카드도 협의 중 카드와 폴백으로 선다. (탭 자체는 크레딧 센터 플래그가
 * 켜져 있을 때만 열린다 — 제휴가 없으면 닫아 둔다, access-policy `dashboardCredits`.)
 */
export async function loadCreditCenter(args: {
  entryId: string;
  seasonId: string;
  phase: SeasonPhase;
  status: EntryStatus;
}): Promise<CreditCenterView> {
  const { entryId, seasonId, phase, status } = args;
  const season = creditSeason(phase);

  const [offers, claims, progress, award] = await Promise.all([
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
        howtoUrl: true,
        redeemNote: true,
        fallbackUrl: true,
        fallbackItems: true,
        sponsor: { select: { name: true, mark: true, logoUrl: true } },
      },
    }),
    prisma.creditClaim.findMany({
      where: { entryId },
      select: {
        offerId: true,
        status: true,
        deliveredAt: true,
        confirmedAt: true,
        creditCode: { select: { code: true } },
      },
    }),
    loadUnlockProgress(entryId),
    prisma.award.findFirst({
      where: { entryId, awardedAt: { not: null } },
      select: { rank: true, prizeDesc: true, awardedAt: true },
    }),
  ]);

  const offerByKind = new Map(offers.map((o) => [o.kind, o]));
  const claimByOffer = new Map(claims.map((c) => [c.offerId, c]));
  const today = devNow();

  const cards = CREDIT_CARDS.map((spec): CreditCardView => {
    const offer = offerByKind.get(spec.kind) ?? null;
    const claim = offer ? (claimByOffer.get(offer.id) ?? null) : null;
    const unlocked = isUnlocked(spec.unlockEvent, progress);
    const at = knownAt(unlockedAt(spec.unlockEvent, progress));

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
      season,
      status,
      lapsed: creditLapsed(offer?.validUntil ?? null, today),
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
      unlockEvent: spec.unlockEvent,
      unlocked,
      unlockedAt: at,
      state,
      offerId: offer?.id ?? null,
      sponsorName: offer?.sponsor?.name ?? null,
      sponsorMark: offer?.sponsor?.mark ?? null,
      sponsorLogoUrl: offer?.sponsor?.logoUrl ?? null,
      description: offer?.description ?? null,
      value: offer?.value ?? null,
      releaseDate: offer?.releaseDate ?? null,
      validUntil: offer?.validUntil ?? null,
      deliveryMethod: offer?.deliveryMethod ?? null,
      fallbackUrl: offer?.fallbackUrl ?? null,
      fallbackItems: parseFallbackItems(offer?.fallbackItems),
      howtoUrl: offer?.howtoUrl ?? null,
      redeemNote: offer?.redeemNote ?? null,
      code_:
        delivered && codeValue
          ? { value: codeValue, masked: state === "confirmed" }
          : null,
      deliveredAt: claim?.deliveredAt ?? null,
      confirmedAt: claim?.confirmedAt ?? null,
    };
  });

  return {
    season,
    cards,
    opened: cards.filter((c) => isOpenedCard(c.state, c.unlocked)).length,
    total: cards.length,
    buildStartAt: knownAt(progress.gate1Passed),
    award: award
      ? {
          /* 라벨은 리더보드와 같은 규칙(public-read `awardOf`) — 운영이 적은 것이 먼저다 */
          label:
            award.prizeDesc ??
            (award.rank === null ? "수상" : award.rank === 1 ? "🏆 대상" : `${award.rank}위`),
          at: award.awardedAt,
        }
      : null,
  };
}

export type CreditResult = { ok: true } | { ok: false; code: CreditFailureCode };

/** 발급에 필요한 카드 값 — 받기·수동 발급·일괄 발송이 같은 것을 든다 */
export type IssueOffer = {
  id: string;
  kind: CreditKind;
  deliveryMethod: CreditDelivery;
  releaseDate: Date | null;
};

/**
 * 한 팀·한 카드의 지금 상태 — 화면·운영 칸과 **같은 재료로** 다시 잰다.
 *
 * 받기와 수동 발급은 화면이 버튼을 그렸다는 사실을 믿지 않는다. 그렇다고 따로
 * 판정하면 둘이 갈라진다 — 받기가 DB의 `unlock_event`(운영자가 바꿀 수 있다)를 보고
 * 화면은 카탈로그를 보던 때, 「발급 가능」 카드가 거절되고 시상 발표 뒤의 카드가
 * 받아졌다(2026-09-30 감사). 그래서 여기서 `creditCardState`를 그대로 부른다.
 *
 * 카드가 그 팀의 시즌 것이 아니면 없는 것으로 본다 — 폼의 offerId는 손으로 바꿀 수 있다.
 */
export async function judgeCredit(args: {
  entryId: string;
  offerId: string;
}): Promise<
  | {
      ok: true;
      offer: IssueOffer;
      state: CreditCardState;
      active: boolean;
      /** 지금 보내도 되나 — 아니면 발급 예정으로 둔다(`issueCredit`) */
      due: boolean;
      /** 수동형을 받아 두고 운영자의 코드를 기다리는 칸(credits.ts `awaitingManualCode`) */
      awaitingCode: boolean;
    }
  | { ok: false; code: "NOT_FOUND" }
> {
  const { entryId, offerId } = args;
  const [offer, entry, claim] = await Promise.all([
    prisma.creditOffer.findUnique({
      where: { id: offerId },
      select: {
        id: true,
        seasonId: true,
        kind: true,
        status: true,
        deliveryMethod: true,
        releaseDate: true,
        validUntil: true,
        season: { select: { phase: true } },
      },
    }),
    prisma.entry.findUnique({
      where: { id: entryId },
      select: { seasonId: true, status: true, stage: true },
    }),
    prisma.creditClaim.findUnique({
      where: { offerId_entryId: { offerId, entryId } },
      select: { status: true, creditCodeId: true },
    }),
  ]);
  if (!offer || !entry || offer.seasonId !== entry.seasonId) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const progress = await loadUnlockProgress(entryId);
  const active = entry.status === EntryStatus.active;
  const today = devNow();
  const state = creditCardState({
    kind: offer.kind,
    offerStatus: offer.status,
    claimStatus: claim?.status ?? null,
    /* 조건은 카탈로그의 것이다 — 운영 편집 카드의 unlock_event가 아니다(화면과 같게) */
    unlocked: isUnlocked(CREDIT_CARD_BY_KIND[offer.kind].unlockEvent, progress),
    season: creditSeason(offer.season.phase),
    status: entry.status,
    lapsed: creditLapsed(offer.validUntil, today),
  });
  return {
    ok: true,
    offer: {
      id: offer.id,
      kind: offer.kind,
      deliveryMethod: offer.deliveryMethod,
      releaseDate: offer.releaseDate,
    },
    state,
    active,
    due: releaseDue({
      kind: offer.kind,
      releaseDate: offer.releaseDate,
      gate1Settled: gate1Settled(entry),
      status: entry.status,
      today,
    }),
    awaitingCode:
      state === "scheduled" &&
      awaitingManualCode({
        deliveryMethod: offer.deliveryMethod,
        claimStatus: claim?.status ?? null,
        hasCode: Boolean(claim?.creditCodeId),
      }),
  };
}

/**
 * 코드 풀에서 하나를 집는다(트랜잭션 안에서만).
 *
 * 조건부 갱신이 곧 잠금이다 — 같은 행을 노린 다른 트랜잭션은 count 0을 받고
 * 물러난다. 물러난 쪽은 **다음 코드로 다시 집는다.** 한 번 만에 포기하던 때는 받기와
 * 일괄 발송이 겹치면 코드가 남아 있어도 「소진」으로 멈췄다(2026-09-30 감사).
 */
async function takeCode(
  tx: Prisma.TransactionClient,
  offerId: string,
): Promise<{ id: string; code: string } | null> {
  const tried: string[] = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await tx.creditCode.findFirst({
      where: { offerId, status: CreditStatus.issued, id: { notIn: tried } },
      orderBy: { createdAt: "asc" },
      select: { id: true, code: true },
    });
    if (!candidate) return null;
    const taken = await tx.creditCode.updateMany({
      where: { id: candidate.id, status: CreditStatus.issued },
      data: { status: CreditStatus.claimed },
    });
    if (taken.count === 1) return candidate;
    tried.push(candidate.id);
  }
  return null;
}

/**
 * 한 팀에 카드 하나를 발급한다(트랜잭션 안에서만) — 받기·수동 발급·일괄 발송의 공통 몸통.
 *
 * 코드 풀이면 코드 하나를 붙인다. 아직 보낼 때가 아니면(`due` false — C1은 게이트 1
 * 전, 그 밖은 지급 예정일 전, credits.ts `releaseDue`) 코드를 태우지 않고 「발급
 * 예정」으로 둔다 — 유효기간이 지급 시점부터 도는 탓이다(설계서 2장 「빌드 시작
 * 시점 지급」). 예정은 `releaseScheduledCredits`가 때가 되면 보낸다.
 *
 * **수동형은 운영자가 적어 넣은 코드(`manualCode`)로만 나간다.** 그 코드로 코드 행을
 * 만들어 붙인다. 코드 없이 받으면 「발급 예정」으로 두고 운영자를 기다린다 — 설계서
 * 5장 「시즌 1 수동 대체 경로」(운영자가 코드를 보내고 상태를 옮긴다, 참가자 화면은
 * 같다). 코드를 적었는데 아직 보낼 때가 아니면 코드를 붙인 채 예정으로 두고, 때가 되면
 * 예정 보내기가 그 코드로 보낸다.
 *
 * **팀당 1회는 여기서 막는다.** 클레임 행을 「행이 없거나 발급 가능인 채」일 때만
 * 옮긴다(`updateMany`+조건, 없으면 `createMany`+`skipDuplicates`). 운영자가 코드를 적을
 * 때는 「코드를 기다리는 예정」도 옮긴다. 팀원 둘이 같은 순간에 누르면 둘째는 유일
 * 제약에서 기다렸다가 물러나고, 집어 둔 코드는 되돌린다. 앞에서 행을 읽고 판단하던
 * 때는 둘 다 통과해 코드가 두 개 나갔다.
 */
export async function issueCredit(
  tx: Prisma.TransactionClient,
  args: {
    offer: IssueOffer;
    entryId: string;
    via: CreditDeliveredVia;
    /** 기록하는 시각 — 진짜 지금 */
    now: Date;
    /** 지금 보내도 되나. 아니면 발급 예정으로 둔다 */
    due: boolean;
    /** 운영자가 적어 넣은 코드 — 수동형 카드에만 쓴다(다른 방식이면 무시한다) */
    manualCode?: string;
  },
): Promise<
  | { ok: true; code: string | null; scheduled: boolean }
  | { ok: false; code: "SOLD_OUT" | "ALREADY_CLAIMED" | "CODE_TAKEN" }
> {
  const { offer, entryId, via, now } = args;
  const manual = offer.deliveryMethod === CreditDelivery.manual;
  const manualCode = manual ? args.manualCode?.trim() || null : null;
  const scheduled = !args.due || (manual && !manualCode);

  let taken: { id: string; code: string } | null = null;
  if (manualCode) {
    /* 코드는 전체에서 유일하다 — 같은 코드가 두 팀에 나가면 한 팀은 못 쓴다 */
    const clash = await tx.creditCode.findUnique({ where: { code: manualCode }, select: { id: true } });
    if (clash) return { ok: false, code: "CODE_TAKEN" };
    taken = await tx.creditCode.create({
      data: { offerId: offer.id, code: manualCode, status: CreditStatus.claimed },
      select: { id: true, code: true },
    });
  } else if (!scheduled && offer.deliveryMethod === CreditDelivery.code_pool) {
    taken = await takeCode(tx, offer.id);
    if (!taken) return { ok: false, code: "SOLD_OUT" };
  }

  const status = scheduled ? CreditClaimStatus.scheduled : CreditClaimStatus.delivered;
  const sent = scheduled ? {} : { deliveredAt: now, deliveredVia: via };
  const attach = taken ? { creditCodeId: taken.id } : {};
  const moved = await tx.creditClaim.updateMany({
    where: { offerId: offer.id, entryId, status: CreditClaimStatus.available },
    data: { status, claimedAt: now, ...sent, ...attach },
  });
  const reserved =
    moved.count === 1 ||
    /* 참가자가 받아 두고 코드를 기다리던 수동형 — 받은 때(claimed_at)는 그대로 둔다 */
    (manualCode !== null &&
      (
        await tx.creditClaim.updateMany({
          where: { offerId: offer.id, entryId, status: CreditClaimStatus.scheduled, creditCodeId: null },
          data: { status, ...sent, ...attach },
        })
      ).count === 1) ||
    (
      await tx.creditClaim.createMany({
        data: [{ offerId: offer.id, entryId, status, claimedAt: now, ...sent, ...attach }],
        skipDuplicates: true,
      })
    ).count === 1;
  if (!reserved) {
    if (taken && manualCode) {
      /* 방금 만든 코드 행이다 — 붙일 곳이 없으면 남기지 않는다 */
      await tx.creditCode.delete({ where: { id: taken.id } });
    } else if (taken) {
      await tx.creditCode.update({
        where: { id: taken.id },
        data: { status: CreditStatus.issued },
      });
    }
    return { ok: false, code: "ALREADY_CLAIMED" };
  }
  return { ok: true, code: taken?.code ?? null, scheduled };
}

/**
 * 크레딧 받기.
 *
 * 판정은 화면과 같은 함수로 다시 하고(`judgeCredit`), 발급은 운영자 발급과 같은
 * 몸통으로 한다(`issueCredit`). 발급이 되면 **팀에 메일과 인앱으로 알린다**
 * (`noticeCreditDelivered`, 트랜잭션 밖). 화면이 「받기를 누르면 이메일로도
 * 보내드려요」라고 약속하는데 메일을 안 보내던 때가 있었다(2026-09-30 감사).
 * 메일이 실패해도 발급은 그대로다 — 코드는 화면에 선다.
 */
export async function claimCredit(args: {
  entryId: string;
  offerId: string;
  /** 누른 사람 — 감사 로그에 남는다(운영 콘솔 발송 이력) */
  actorId: string;
}): Promise<{ ok: true; scheduled: boolean } | { ok: false; code: CreditFailureCode }> {
  const judged = await judgeCredit(args);
  if (!judged.ok) return judged;

  /* 시상 카드는 여기서 받는 것이 아니다 — 시상 절차가 따로 간다 */
  if (isAwardCard(judged.offer.kind)) return { ok: false, code: "LOCKED" };
  const refusal = claimRefusal(judged.state, judged.active);
  if (refusal) return { ok: false, code: refusal };

  const result = await prisma.$transaction(async (tx) => {
    const r = await issueCredit(tx, {
      offer: judged.offer,
      entryId: args.entryId,
      via: CreditDeliveredVia.email,
      now: new Date(),
      due: judged.due,
    });
    /*
      감사 로그 — 운영 콘솔 발송 이력이 이것을 읽는다. 참가자가 스스로 받은 것이
      이력에 없어 누가 언제 어느 카드를 가져갔는지 되짚을 수 없었다(2026-09-30 감사).
      admin-store `writeAudit`과 같은 모양이다(그 파일이 이 파일을 불러 되부를 수 없다).
    */
    if (r.ok) {
      await tx.auditLog.create({
        data: {
          actorId: args.actorId,
          action: "credit.claim",
          targetType: "entry",
          targetId: args.entryId,
          reason: r.scheduled ? "참가자 받기, 발급 예정" : "참가자 받기",
          meta: { offerId: judged.offer.id, kind: judged.offer.kind, entryId: args.entryId, scheduled: r.scheduled },
        },
      });
    }
    return r;
  });
  /* 받기는 코드를 적어 넣지 않는다 — 「코드 중복」은 운영자 수동 발급에서만 난다 */
  if (!result.ok) return { ok: false, code: result.code === "CODE_TAKEN" ? "ALREADY_CLAIMED" : result.code };
  if (!result.scheduled) {
    await noticeCreditDelivered({
      offerId: judged.offer.id,
      deliveries: [{ entryId: args.entryId, code: result.code }],
    });
  }
  return { ok: true, scheduled: result.scheduled };
}

/**
 * 발급 예정을 보낸다 — 때가 된 것만(credits.ts `releaseDue`). C1은 그 팀의 게이트 1이
 * 가려졌을 때, 그 밖은 지급 예정일이 왔을 때.
 *
 * 부르는 곳 셋. 게이트 1 판정 직후(judging-store, 그 팀만), 게이트 마감 처리 직후
 * (페이즈 크론·개발 바 「마감」 줄), 그리고 페이즈 크론이 15분마다 전체를 한 번.
 * 크론이 그물이고 앞의 둘은 기다리지 않게 하는 것이다. 여러 번 불러도 같다 —
 * 「아직 발급 예정인 그 행」을 옮긴 쪽만 가져간다.
 *
 * 카드가 활성이 아니거나 유효기간이 지났으면 보내지 않는다(화면도 그 카드를 「만료」로
 * 그린다). 코드가 모자라면 그 팀은 예정으로 남고 다음 번에 다시 본다.
 *
 * 수동형은 운영자가 적어 둔 코드가 있어야 보낸다. 없으면 운영자를 기다린다(운영 칸
 * 「발급 예정, 코드 대기」) — 전에는 코드 없는 「발급 완료」로 옮겨졌다.
 */
export async function releaseScheduledCredits(
  args: { entryIds?: string[] } = {},
): Promise<{ released: number; soldOut: number; failed: number }> {
  const today = devNow();
  const claims = await prisma.creditClaim.findMany({
    where: {
      status: CreditClaimStatus.scheduled,
      offer: { status: CreditOfferStatus.active },
      ...(args.entryIds ? { entryId: { in: args.entryIds } } : {}),
    },
    select: {
      id: true,
      entryId: true,
      creditCode: { select: { id: true, code: true } },
      offer: {
        select: {
          id: true,
          kind: true,
          deliveryMethod: true,
          releaseDate: true,
          validUntil: true,
          season: { select: { phase: true, featureFlags: true } },
        },
      },
      entry: { select: { stage: true, status: true } },
    },
  });

  const byOffer = new Map<string, { kind: CreditKind; deliveries: { entryId: string; code: string | null }[] }>();
  let soldOut = 0;
  let failed = 0;
  for (const claim of claims) {
    const { offer } = claim;
    /*
      크레딧 센터가 꺼진 시즌은 보내지 않는다 — 참가자의 혜택 화면이 404라 받은 코드를
      못 보고 알림 링크도 404다(운영 콘솔 발급과 같은 규칙). 켜지면 다음 크론이 보낸다.
      끝난 시즌·유효기간 지난 카드도 보내지 않는다(화면이 「만료」로 그린다).
    */
    if (!parseFeatureFlags(offer.season.featureFlags).credits) continue;
    if (creditSeason(offer.season.phase) === "over") continue;
    if (creditLapsed(offer.validUntil, today)) continue;
    const due = releaseDue({
      kind: offer.kind,
      releaseDate: offer.releaseDate,
      gate1Settled: gate1Settled(claim.entry),
      status: claim.entry.status,
      today,
    });
    if (!due) continue;
    /* 수동형인데 운영자가 아직 코드를 안 적었다 — 보낼 것이 없다 */
    if (
      awaitingManualCode({
        deliveryMethod: offer.deliveryMethod,
        claimStatus: CreditClaimStatus.scheduled,
        hasCode: Boolean(claim.creditCode),
      })
    ) {
      continue;
    }

    /* 한 줄이 실패해도 나머지는 보낸다 — 실패한 줄은 예정으로 남아 다음 번에 다시 본다 */
    let out: "sold_out" | { code: string | null } | null;
    try {
      out = await prisma.$transaction(async (tx) => {
        /* 먼저 붙어 있는 코드(운영자가 적어 둔 수동형)가 있으면 그것으로 보낸다 */
        const attached = claim.creditCode ?? null;
        const pool = !attached && offer.deliveryMethod === CreditDelivery.code_pool;
        const taken = attached ?? (pool ? await takeCode(tx, offer.id) : null);
        if (pool && !taken) return "sold_out" as const;
        const moved = await tx.creditClaim.updateMany({
          where: { id: claim.id, status: CreditClaimStatus.scheduled },
          data: {
            status: CreditClaimStatus.delivered,
            deliveredAt: new Date(),
            deliveredVia: CreditDeliveredVia.email,
            ...(taken && !attached ? { creditCodeId: taken.id } : {}),
          },
        });
        if (moved.count === 0) {
          /* 다른 실행이 먼저 보냈다 — 풀에서 집어 둔 코드를 되돌린다 */
          if (taken && !attached) {
            await tx.creditCode.update({
              where: { id: taken.id },
              data: { status: CreditStatus.issued },
            });
          }
          return null;
        }
        return { code: taken?.code ?? null };
      });
    } catch (e) {
      failed += 1;
      console.error("[credits] 발급 예정 보내기 실패", claim.id, e);
      continue;
    }
    if (out === "sold_out") {
      soldOut += 1;
      continue;
    }
    if (!out) continue;
    const group = byOffer.get(offer.id) ?? { kind: offer.kind, deliveries: [] };
    group.deliveries.push({ entryId: claim.entryId, code: out.code });
    byOffer.set(offer.id, group);
  }

  /*
    감사 로그·알림은 카드마다 따로 감싼다 — 하나가 실패해도 다른 카드의 팀은 알림을
    받는다. 이미 보낸 발급은 되돌리지 않는다(코드는 화면에 선다).
  */
  let released = 0;
  for (const [offerId, { kind, deliveries }] of byOffer) {
    released += deliveries.length;
    try {
      /* 발송 이력의 「시스템 … 자동」 줄 — 시안 「C1 코드 일괄 발송, 31팀, 이메일」 */
      await prisma.auditLog.create({
        data: {
          actorId: null,
          action: "credit.release",
          targetType: "credit_offer",
          targetId: offerId,
          reason: kind === CreditKind.c1 ? "게이트 1 판정 뒤 발급 예정 발송" : "지급 예정일 발송",
          meta: { kind, teams: deliveries.length, entryIds: deliveries.map((d) => d.entryId) },
        },
      });
      await noticeCreditDelivered({ offerId, deliveries });
    } catch (e) {
      console.error("[credits] 발급 예정 알림 실패", offerId, e);
    }
  }
  return { released, soldOut, failed };
}

/** 「C1 빌더 크레딧이」 — 카드 이름 끝 글자의 받침으로 조사를 고른다 */
function subjectJosa(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return "이(가)";
  return code % 28 === 0 ? "가" : "이";
}

/** 발급 메일의 재료 — 카드 한 장 */
const MAIL_OFFER_SELECT = {
  kind: true,
  deliveryMethod: true,
  inviteUrl: true,
  validUntil: true,
  redeemNote: true,
  sponsor: { select: { name: true } },
} as const;

type MailOffer = Prisma.CreditOfferGetPayload<{ select: typeof MAIL_OFFER_SELECT }>;

type CreditMember = { userId: string; email: string | null; entryId: string; teamName: string };

/** 발급받은 팀들의 팀원 — 인앱 알림과 메일이 같은 목록을 쓴다 */
async function creditMembers(entryIds: string[]): Promise<CreditMember[]> {
  const rows = await prisma.teamMember.findMany({
    where: { team: { entries: { some: { id: { in: entryIds } } } } },
    select: {
      userId: true,
      user: { select: { email: true } },
      team: { select: { name: true, entries: { select: { id: true } } } },
    },
  });
  return rows.flatMap((m) => {
    const entryId = entryIds.find((id) => m.team.entries.some((e) => e.id === id));
    return entryId ? [{ userId: m.userId, email: m.user.email, entryId, teamName: m.team.name }] : [];
  });
}

/**
 * 팀원마다 발급 메일 한 통 — 코드·링크·기한·적용 방법. 돌려주는 것은 한 통이라도 못
 * 보낸 팀의 id.
 *
 * 메일은 이행 메일이라 알림 스위치(`notify_email`)와 무관하다(mail.ts `sendCreditMail`).
 * 주소가 없는 팀원은 건너뛴다 — 실패가 아니라 보낼 곳이 없는 것이라 다시 보내도 같다.
 */
async function mailCreditToTeams(
  offer: MailOffer,
  members: CreditMember[],
  deliveries: { entryId: string; code: string | null }[],
  link: string | null,
): Promise<Set<string>> {
  const card = CREDIT_CARD_BY_KIND[offer.kind];
  const failed = new Set<string>();
  for (const m of members) {
    const d = deliveries.find((x) => x.entryId === m.entryId);
    if (!d || !m.email) continue;
    const r = await sendCreditMail({
      email: m.email,
      card: `${card.code} ${card.title}`,
      josa: subjectJosa(card.title),
      sponsor: offer.sponsor?.name ?? null,
      code: d.code,
      link,
      validUntil: offer.validUntil,
      howto: offer.redeemNote,
    });
    if (!r.ok) failed.add(d.entryId);
  }
  return failed;
}

/**
 * 메일 결과를 칸에 적는다 — 못 보낸 팀은 `mail_failed_at`, 다 보낸 팀은 비운다.
 * 못 보낸 팀이 있으면 감사 로그에 시스템 줄을 남긴다(운영 콘솔 발송 이력·감사 로그).
 * 이 기록이 실패해도 발급과 메일은 이미 끝났다 — 삼키고 로그만 남긴다.
 */
async function recordCreditMail(args: {
  offerId: string;
  kind: CreditKind;
  sent: string[];
  failed: string[];
  teamName: Map<string, string>;
  /** 재발송이면 운영자 줄(credit.resend)이 따로 남으므로 시스템 줄을 안 쓴다 */
  quiet?: boolean;
}): Promise<void> {
  const { offerId, kind, failed } = args;
  const ok = args.sent.filter((id) => !failed.includes(id));
  try {
    const now = new Date();
    if (failed.length) {
      await prisma.creditClaim.updateMany({
        where: { offerId, entryId: { in: failed } },
        data: { mailFailedAt: now },
      });
    }
    if (ok.length) {
      await prisma.creditClaim.updateMany({
        where: { offerId, entryId: { in: ok }, mailFailedAt: { not: null } },
        data: { mailFailedAt: null },
      });
    }
    if (failed.length && !args.quiet) {
      await prisma.auditLog.create({
        data: {
          actorId: null,
          action: "credit.mail_failed",
          targetType: "credit_offer",
          targetId: offerId,
          reason: `발급 메일 ${failed.length}팀 실패, 운영 콘솔에서 재발송`,
          meta: {
            kind,
            entryIds: failed,
            target: creditTargetLabel(kind, failed.map((id) => args.teamName.get(id) ?? "팀")),
          },
        },
      });
    }
  } catch (e) {
    console.error("[credits] 메일 결과 기록 실패", offerId, e);
  }
}

/**
 * 발급을 팀에 알린다 — 팀원마다 인앱 한 줄과 메일 한 통(코드·링크·기한·적용 방법).
 *
 * 받기·수동 발급·일괄 발송·발급 예정 보내기가 전부 이것을 부른다. **트랜잭션 밖에서**
 * 부른다 — 메일이 실패해도 발급은 되돌리지 않는다(코드는 화면에 선다). 대신 못 보낸
 * 팀을 칸에 적어(`mail_failed_at`) 운영자가 재발송하게 한다.
 *
 * **던지지 않는다.** 알림이 통째로 실패하면(DB·메일 서버) 그 팀들을 전부 못 보낸 것으로
 * 적는다 — 받기가 이미 끝났는데 참가자에게 오류가 뜨면 다시 누르게 된다.
 * 돌려주는 것은 메일을 한 통이라도 못 보낸 팀의 id — 운영 화면이 팀 이름으로 알린다.
 */
export async function noticeCreditDelivered(args: {
  offerId: string;
  deliveries: { entryId: string; code: string | null }[];
}): Promise<{ mailFailed: string[] }> {
  if (args.deliveries.length === 0) return { mailFailed: [] };
  let offer: MailOffer;
  try {
    offer = await prisma.creditOffer.findUniqueOrThrow({
      where: { id: args.offerId },
      select: MAIL_OFFER_SELECT,
    });
  } catch (e) {
    console.error("[credits] 발급 알림 실패 — 카드를 못 읽음", args.offerId, e);
    return { mailFailed: args.deliveries.map((d) => d.entryId) };
  }
  /*
    보낼 것이 없는 발급(이메일 명단 방식, 코드 없음)에는 「발급됐어요」를 보내지
    않는다 — 코드도 링크도 없는 메일과 「코드를 확인해요」 알림만 가게 된다. 그 방식은
    운영자가 스폰서 쪽에서 따로 처리한다.
  */
  const link = offer.deliveryMethod === CreditDelivery.invite_link ? offer.inviteUrl : null;
  const deliveries = args.deliveries.filter((d) => d.code || link);
  if (deliveries.length === 0) return { mailFailed: [] };
  const card = CREDIT_CARD_BY_KIND[offer.kind];
  const sent = deliveries.map((d) => d.entryId);

  let members: CreditMember[];
  try {
    members = await creditMembers(sent);
  } catch (e) {
    console.error("[credits] 발급 알림 실패 — 팀원을 못 읽음", args.offerId, e);
    await recordCreditMail({ offerId: args.offerId, kind: offer.kind, sent, failed: sent, teamName: new Map() });
    return { mailFailed: sent };
  }
  const teamName = new Map(members.map((m) => [m.entryId, m.teamName]));

  /* 인앱이 먼저다 — 메일 서버가 느리거나 죽어도 화면 알림은 간다 */
  try {
    await prisma.notification.createMany({
      data: members.map((m) => ({
        userId: m.userId,
        type: "notice",
        title: `${card.code} ${card.title} 발급`,
        body: "혜택과 크레딧에서 코드와 적용 방법을 확인해요.",
        linkUrl: "/dashboard/credits",
        channel: NotifChannel.inapp,
        sentAt: new Date(),
      })),
    });
  } catch (e) {
    console.error("[credits] 발급 인앱 알림 실패", args.offerId, e);
  }

  let failed: string[];
  try {
    failed = [...(await mailCreditToTeams(offer, members, deliveries, link))];
  } catch (e) {
    console.error("[credits] 발급 메일 실패", args.offerId, e);
    failed = sent;
  }
  await recordCreditMail({ offerId: args.offerId, kind: offer.kind, sent, failed, teamName });
  return { mailFailed: failed };
}

/**
 * 발급 메일을 다시 보낸다 — 운영 콘솔 「재발송」. 같은 코드·링크를 같은 메일로
 * 보낸다(인앱 알림은 처음 발급 때 이미 갔다). 칸의 메일 실패 표시는 결과대로 고친다.
 *
 * 보낼 수 있는지(발급 완료·확인인 칸)는 부르는 쪽이 `judgeCredit`으로 이미 가렸다.
 */
export async function resendCreditDelivery(args: {
  offerId: string;
  entryId: string;
}): Promise<{ ok: true; failed: boolean; kind: CreditKind; teamName: string | null } | { ok: false }> {
  const claim = await prisma.creditClaim.findUnique({
    where: { offerId_entryId: { offerId: args.offerId, entryId: args.entryId } },
    select: { creditCode: { select: { code: true } }, offer: { select: MAIL_OFFER_SELECT } },
  });
  if (!claim) return { ok: false };
  const { offer } = claim;
  const link = offer.deliveryMethod === CreditDelivery.invite_link ? offer.inviteUrl : null;
  const code = claim.creditCode?.code ?? null;
  if (!code && !link) return { ok: false };

  let failed: boolean;
  let teamName = new Map<string, string>();
  try {
    const members = await creditMembers([args.entryId]);
    teamName = new Map(members.map((m) => [m.entryId, m.teamName]));
    const lost = await mailCreditToTeams(offer, members, [{ entryId: args.entryId, code }], link);
    /* 주소 있는 팀원이 아무도 없으면 나간 메일이 없다 — 실패로 둔다 */
    failed = !members.some((m) => m.email) || lost.size > 0;
  } catch (e) {
    console.error("[credits] 재발송 실패", args.offerId, args.entryId, e);
    failed = true;
  }
  await recordCreditMail({
    offerId: args.offerId,
    kind: offer.kind,
    sent: [args.entryId],
    failed: failed ? [args.entryId] : [],
    teamName,
    quiet: true,
  });
  return { ok: true, failed, kind: offer.kind, teamName: teamName.get(args.entryId) ?? null };
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
  howtoUrl: string | null;
  redeemNote: string | null;
  fallbackUrl: string | null;
  fallbackItems: FallbackItem[];
  sponsorLogoUrl: string | null;
  /** 코드 풀. 링크형·수동형이면 total 0이다. consumed는 발급된 코드, expired는 만료 */
  pool: { remaining: number; total: number; consumed: number; expired: number };
};

/**
 * 발급 현황 한 칸 — 시안 `.bd-mini` 배지 하나. 클레임 행이 있으면 그 상태, 없으면
 * 팀의 진행(언락 사건)과 카드 상태로 센다 — 행은 「받기」·발급이 일어나야 생긴다.
 */
export type AdminClaimCell = {
  kind: CreditKind;
  label: string;
  tone: "lime" | "teal" | "gray" | "red" | "warn";
  dashed: boolean;
  /** 지금 보낼 수 있다 — 수동 발급·일괄 발송의 대상 */
  available: boolean;
  /** 수동형을 받아 두고 운영자의 코드를 기다린다 — 수동 발급(코드 입력)의 대상 */
  awaitingCode: boolean;
  /** 발급 기록 — 칸을 누르면 여는 발급 상세. 발급 기록이 없는 칸은 null */
  detail: AdminClaimDetail | null;
};

/** 운영 콘솔 발급 상세 — 나간 코드·메일 결과·재발송 */
export type AdminClaimDetail = {
  offerId: string;
  /** 나간 코드. 수동형이면 운영자가 적은 것, 링크형·이메일 명단형은 null */
  code: string | null;
  /** 링크형이면 카드의 초대 링크 */
  link: string | null;
  deliveredAt: Date | null;
  /** 마지막 발송에서 메일이 못 나간 때. 다 나갔으면 null */
  mailFailedAt: Date | null;
  /** 다시 보낼 수 있다 — 발급 완료·확인이고 보낼 코드나 링크가 있다 */
  resendable: boolean;
};

export type AdminClaimRow = {
  entryId: string;
  teamName: string;
  ideaTitle: string;
  stage: EntryStage;
  status: string;
  /** s3 이후인데 배포 확인이 안 됐다 — 시안 「미배포」 */
  undeployed: boolean;
  cells: AdminClaimCell[];
  lastDeliveredAt: Date | null;
  /** 스폰서 정보 제공 선택 동의. 없으면 이메일 명단에 넣지 않는다 */
  sponsorConsent: boolean;
};

/** 발송 이력의 「확인」 줄 — 참가자가 적용했다고 표시한 때 */
export type AdminClaimConfirm = { at: Date; teamName: string; kind: CreditKind };

export type AdminCreditSummary = {
  activeOffers: number;
  totalOffers: number;
  codesRemaining: number;
  /** C1 코드 잔여 — 시안 KPI 둘째 */
  c1Remaining: number;
  deliveredTeams: number;
  confirmedTeams: number;
};

export type AdminCreditConsole = {
  summary: AdminCreditSummary;
  offers: AdminOfferRow[];
  claims: AdminClaimRow[];
  confirms: AdminClaimConfirm[];
};

/**
 * 카드 상태를 운영 표의 배지 하나로. 협의 중 카드는 열려도 폴백만 보이므로
 * (설계서) 열렸는지만 같이 적고, 못 연 칸은 참가자 화면과 달리 「잠금」으로 센다 —
 * 운영자가 볼 것은 「지금 보낼 수 있나」다.
 */
function adminCell(
  state: CreditCardState,
  unlocked: boolean,
  claim: { awaitingCode: boolean; mailFailed: boolean } = { awaitingCode: false, mailFailed: false },
): Omit<AdminClaimCell, "kind" | "detail"> {
  const awaitingCode = state === "scheduled" && claim.awaitingCode;
  const cell = (label: string, tone: AdminClaimCell["tone"], dashed = false) => ({
    label,
    tone,
    dashed,
    available: state === "available",
    awaitingCode,
  });
  switch (state) {
    case "negotiating":
      return unlocked ? cell("협의 중, 열림", "gray", true) : cell("잠금", "gray");
    case "available":
      return cell(CLAIM_STATUS_LABEL.available, "lime");
    case "scheduled":
      /*
        내가 정함(수연 확인 대기) — 시안에 없는 두 칸. 상태 필터가 앞마디로 거르므로
        「발급 예정」·「발급 완료」로 시작하게 둔다. 운영자가 할 일이 있는 칸이라 색을 바꾼다.
      */
      return awaitingCode
        ? cell(`${CLAIM_STATUS_LABEL.scheduled}, 코드 대기`, "warn", true)
        : cell(CLAIM_STATUS_LABEL.scheduled, "lime", true);
    case "delivered":
      return claim.mailFailed
        ? cell(`${CLAIM_STATUS_LABEL.delivered}, 메일 실패`, "red")
        : cell(CLAIM_STATUS_LABEL.delivered, "lime");
    case "confirmed":
      return cell(CLAIM_STATUS_LABEL.confirmed, "teal");
    case "expired":
      return cell(CLAIM_STATUS_LABEL.expired, "gray");
    default:
      return cell("잠금", "gray");
  }
}

/**
 * 스폰서 크레딧 콘솔 한 판 — 혜택 설정 · 팀별 발급 현황.
 *
 * 발송 이력은 감사 로그가 정본이라 여기서 만들지 않는다(admin-read의 로그 조회를
 * 그대로 쓴다). 같은 사실을 두 곳에 적으면 둘이 갈라진다.
 */
export async function loadAdminCreditConsole(
  seasonId: string,
): Promise<AdminCreditConsole> {
  const [season, offers, entries] = await Promise.all([
    prisma.season.findUniqueOrThrow({ where: { id: seasonId }, select: { phase: true } }),
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
        howtoUrl: true,
        redeemNote: true,
        fallbackUrl: true,
        fallbackItems: true,
        sponsorId: true,
        sponsor: { select: { name: true, logoUrl: true } },
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
        raceStartedAt: true,
        team: { select: { name: true } },
        hostname: { select: { deployStatus: true, ownershipVerifiedAt: true } },
        creditClaims: {
          select: {
            offerId: true,
            status: true,
            deliveredAt: true,
            confirmedAt: true,
            mailFailedAt: true,
            creditCode: { select: { code: true } },
          },
        },
        consents: { select: { type: true, granted: true } },
      },
    }),
  ]);
  /* 팀마다 언락 사건 — 클레임 행이 없는 칸을 「발급 가능」·「잠금」으로 가른다 */
  const progress = new Map(
    await Promise.all(
      entries.map(async (e) => [e.id, await loadUnlockProgress(e.id)] as const),
    ),
  );
  const creditSeasonNow = creditSeason(season.phase);
  const now = devNow();
  const lapsedOffer = new Set(
    offers.filter((o) => creditLapsed(o.validUntil, now)).map((o) => o.id),
  );

  const byId = new Map(offers.map((o) => [o.id, o]));

  const offerRows: AdminOfferRow[] = CREDIT_CARDS.flatMap((spec) => {
    const offer = offers.find((o) => o.kind === spec.kind);
    if (!offer) return [];
    const total = offer.codes.length;
    const issued = offer.codes.filter((c) => c.status === CreditStatus.issued).length;
    /* 유효기간이 지난 카드의 남은 코드는 못 나간다 — 잔여가 아니라 만료로 센다 */
    const lapsed = lapsedOffer.has(offer.id);
    const remaining = lapsed ? 0 : issued;
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
        howtoUrl: offer.howtoUrl,
        redeemNote: offer.redeemNote,
        fallbackUrl: offer.fallbackUrl,
        fallbackItems: parseFallbackItems(offer.fallbackItems),
        sponsorLogoUrl: offer.sponsor?.logoUrl ?? null,
        pool: {
          remaining,
          total,
          consumed: offer.codes.filter((c) => c.status === CreditStatus.claimed).length,
          expired:
            offer.codes.filter((c) => c.status === CreditStatus.expired).length +
            (lapsed ? issued : 0),
        },
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
      /* 리더보드의 「미배포」와 같은 정의(race.ts). 게이트 1 전 팀은 아직 배포할 때가 아니다 */
      undeployed: stageAtLeast(entry.stage, EntryStage.s3) && notDeployed(entry, now),
      cells: claimKinds.map((spec): AdminClaimCell => {
        const offer = offers.find((o) => o.kind === spec.kind);
        const claim = offer ? claimByOffer.get(offer.id) : undefined;
        const unlocked = isUnlocked(spec.unlockEvent, progress.get(entry.id)!);
        /* 참가자 화면과 같은 함수다 — 칸과 카드가 따로 세면 둘이 갈라진다 */
        const state = creditCardState({
          kind: spec.kind,
          offerStatus: offer?.status ?? CreditOfferStatus.negotiating,
          claimStatus: claim?.status ?? null,
          unlocked,
          season: creditSeasonNow,
          status: entry.status,
          lapsed: offer ? lapsedOffer.has(offer.id) : false,
        });
        const code = claim?.creditCode?.code ?? null;
        const link =
          offer?.deliveryMethod === CreditDelivery.invite_link ? (offer.inviteUrl ?? null) : null;
        const mailFailed = Boolean(claim?.mailFailedAt) && state === "delivered";
        const awaitingCode =
          !!offer &&
          awaitingManualCode({
            deliveryMethod: offer.deliveryMethod,
            claimStatus: claim?.status ?? null,
            hasCode: code !== null,
          });
        return {
          kind: spec.kind,
          ...adminCell(state, unlocked, { awaitingCode, mailFailed }),
          detail:
            offer && claim && claim.status !== CreditClaimStatus.available
              ? {
                  offerId: offer.id,
                  code,
                  link,
                  deliveredAt: claim.deliveredAt,
                  mailFailedAt: claim.mailFailedAt,
                  resendable: (state === "delivered" || state === "confirmed") && (code !== null || link !== null),
                }
              : null,
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

  const confirms: AdminClaimConfirm[] = entries.flatMap((entry) =>
    entry.creditClaims
      .filter((c) => c.confirmedAt && byId.has(c.offerId))
      .map((c) => ({ at: c.confirmedAt!, teamName: entry.team.name, kind: byId.get(c.offerId)!.kind })),
  );

  return {
    confirms,
    summary: {
      activeOffers: offerRows.filter(
        (o) => o.status === CreditOfferStatus.active,
      ).length,
      totalOffers: CREDIT_CARDS.length,
      codesRemaining: offerRows.reduce((sum, o) => sum + o.pool.remaining, 0),
      c1Remaining: offerRows.find((o) => o.kind === CreditKind.c1)?.pool.remaining ?? 0,
      deliveredTeams: deliveredTeams.size,
      confirmedTeams: confirmedTeams.size,
    },
    offers: offerRows,
    claims: claimRows,
  };
}
