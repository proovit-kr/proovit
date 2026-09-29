import {
  CreditClaimStatus,
  CreditDelivery,
  CreditKind,
  CreditOfferStatus,
  CreditUnlockEvent,
  SeasonPhase,
} from "@/generated/prisma/enums";
import { phaseAtLeast } from "@/lib/season-phase";

/*
  혜택·크레딧의 **순수** 절반. 클라이언트도 읽는다(§8 · payment.ts와 같은 분리).

  근거는 13 크레딧 센터 설계서 v0.1(2026.08.22)이다. 그 문서가 고정한 것 넷 중
  둘이 여기 있다 — 카드가 무엇인지(3장)와 상태가 어떻게 바뀌는지(4장). 나머지
  둘(지급 흐름·폴백)은 credits-store.ts와 화면이 맡는다. 화면의 모양은 시안 ver4
  `#scr-credits` 일곱 판이 정본이다(2026-09-23).

  ⚠️ **카드 4장은 코드에 박고, 값은 DB에서 읽는다.** 종류·언락 조건·순서는
  설계서가 고정한 구조라 시즌마다 바뀌지 않는다. 반대로 스폰서·금액·유효기간·
  코드 방식은 9/14 go/no-go 뒤에야 정해진다 — 그래서 그쪽만 credit_offers에 있다.
  구조까지 DB로 내리면 운영자가 화면 순서를 바꿀 수 있게 되는데, 그건 아무도
  원한 적 없는 자유도다.

  ⚠️ **없는 값을 지어내지 않는다.** 스폰서가 안 붙은 카드는 금액도 유효기간도
  「협의 중」이다. 그럴듯한 "$50 상당"을 채워 넣으면 그게 스크린샷으로 돌아다닌다.
*/

// ═════════════════════════════════════════════════════════════
// 카드 카탈로그 — 13 설계서 3장 표
// ═════════════════════════════════════════════════════════════

export type CreditCardSpec = {
  kind: CreditKind;
  /** 화면에 찍는 코드값. C1~C4 */
  code: string;
  title: string;
  /** 카드를 여는 사건 */
  unlockEvent: CreditUnlockEvent;
  /** 참가자에게 보여줄 조건 문구 */
  condition: string;
};

export const CREDIT_CARDS: readonly CreditCardSpec[] = [
  {
    kind: CreditKind.c1,
    code: "C1",
    title: "빌더 크레딧",
    unlockEvent: CreditUnlockEvent.s1_submitted,
    condition: "s1 제출 완료",
  },
  {
    kind: CreditKind.c2,
    code: "C2",
    title: "API와 클라우드",
    unlockEvent: CreditUnlockEvent.gate1_passed,
    condition: "게이트 1 통과",
  },
  {
    kind: CreditKind.c3,
    code: "C3",
    title: "마케팅과 분석",
    unlockEvent: CreditUnlockEvent.deploy_verified,
    condition: "배포 URL 검증 완료",
  },
  {
    kind: CreditKind.c4,
    code: "C4",
    title: "시상 크레딧",
    unlockEvent: CreditUnlockEvent.final_confirmed,
    condition: "2차 심사 확정",
  },
] as const;

export const CREDIT_CARD_BY_KIND: Record<CreditKind, CreditCardSpec> =
  Object.fromEntries(CREDIT_CARDS.map((c) => [c.kind, c])) as Record<
    CreditKind,
    CreditCardSpec
  >;

/**
 * C4는 클레임 흐름을 타지 않는다.
 *
 * 시상 크레딧은 참가 지원 자원이 아니라 **부상**이라 16 운영규칙서의 상금 규정이
 * 적용된다(13 설계서 3장 운영 메모 · 8장). 참가자가 버튼을 눌러 받는 것이
 * 아니라 시상 절차가 따로 간다 — 혜택 탭에는 결과 안내 카드만 선다.
 */
export function isAwardCard(kind: CreditKind): boolean {
  return kind === CreditKind.c4;
}

// ═════════════════════════════════════════════════════════════
// 언락 판정 — 13 설계서 3장 「언락 이벤트」
// ═════════════════════════════════════════════════════════════

/**
 * 팀이 지금까지 일으킨 사건들과 **그 때**. 안 일어났으면 null.
 *
 * `entry.stage` 하나로 넷을 다 판정하지 않는 이유는 배포 검증이다 — 그건 진도가
 * 아니라 hostnames의 검증 상태라서 s3에 와 있어도 아직 안 끝나 있을 수 있다.
 * 때를 함께 드는 것은 시안 카드의 조건 칩(「✓ s1 제출 완료 10.03」) 때문이다.
 */
export type UnlockProgress = {
  s1Submitted: Date | null;
  gate1Passed: Date | null;
  deployVerified: Date | null;
  finalConfirmed: Date | null;
};

export function unlockedAt(
  event: CreditUnlockEvent,
  progress: UnlockProgress,
): Date | null {
  switch (event) {
    case CreditUnlockEvent.s1_submitted:
      return progress.s1Submitted;
    case CreditUnlockEvent.gate1_passed:
      return progress.gate1Passed;
    case CreditUnlockEvent.deploy_verified:
      return progress.deployVerified;
    case CreditUnlockEvent.final_confirmed:
      return progress.finalConfirmed;
  }
}

export function isUnlocked(
  event: CreditUnlockEvent,
  progress: UnlockProgress,
): boolean {
  return unlockedAt(event, progress) !== null;
}

// ═════════════════════════════════════════════════════════════
// 지급 시점과 유효기간
// ═════════════════════════════════════════════════════════════

const DAY_MS = 86_400_000;

/**
 * 유효기간이 지났는가. 유효기간은 날짜(그날 00:00 KST로 적힌다)이고 **그날 끝까지**
 * 쓸 수 있다 — 「~ 11.30」이면 11.30 하루는 아직 쓴다.
 */
export function creditLapsed(validUntil: Date | null, today: Date): boolean {
  return validUntil !== null && today.getTime() >= validUntil.getTime() + DAY_MS;
}

/**
 * 발급 예정인 것을 지금 보내도 되나.
 *
 *   C1  그 팀의 **게이트 1이 가려졌을 때**(통과 또는 탈락). 설계서 2장은 「빌드
 *       스테이지 개시일에 지급」이다 — 유효기간이 지급 시점부터 돌기 때문이다.
 *       유동 게이트(2026-09-25) 뒤로 빌드는 팀마다 게이트 1을 통과한 때 시작하므로
 *       달력 날짜 하나로는 이르거나 늦다(2026-09-30 수연 결정). 게이트 1에서 떨어진
 *       팀도 받기를 눌러 둔 C1은 받는다 — 설계서 3장 「탈락 팀은 C1까지만 보유」,
 *       시안 ⑥(테스터 전환, C1 발급 완료). `release_date`는 C1에 쓰지 않는다.
 *   그 밖  지급 예정일(`release_date`)이 왔을 때. 없으면 바로.
 */
export function releaseDue(args: {
  kind: CreditKind;
  releaseDate: Date | null;
  /** 게이트 1이 가려졌는가 — 통과해 진도가 s3 이상이거나 탈락했다 */
  gate1Settled: boolean;
  today: Date;
}): boolean {
  if (args.kind === CreditKind.c1) return args.gate1Settled;
  return args.releaseDate === null || args.releaseDate.getTime() <= args.today.getTime();
}

// ═════════════════════════════════════════════════════════════
// 시즌 구간 — 카드 상태를 가르는 셋째 축
// ═════════════════════════════════════════════════════════════

/**
 * 시안 일곱 판이 시즌을 셋으로 본다 — ① 모집 중(`pre`), ②~⑥ 레이스(`racing`),
 * ⑦ 시상 발표 뒤(`over`). 「협의 중」 카드가 언제 「잠금」으로 읽히는지, 안 열린
 * 카드가 언제 「만료」가 되는지를 이 값이 가른다.
 */
export type CreditSeason = "pre" | "racing" | "over";

export function creditSeason(phase: SeasonPhase): CreditSeason {
  if (phaseAtLeast(phase, SeasonPhase.awarded)) return "over";
  if (phase === SeasonPhase.racing) return "racing";
  return "pre";
}

// ═════════════════════════════════════════════════════════════
// 카드 표시 상태 — 13 설계서 4장 두 표를 하나로 합친 값
// ═════════════════════════════════════════════════════════════

/*
  DB에는 표가 둘이다 — 카드 상태(credit_offers.status)와 발급 상태
  (credit_claims.status). 화면이 그리는 것은 그 둘의 **곱**이라, 화면마다
  곱셈을 다시 하면 반드시 어긋난다. 여기서 한 번 접어 아홉 값으로 만든다.
  시안의 `st`(pend·lock·sched·ready·sent·ok·exp·award)와 하나씩 짝이 있다.
*/
export type CreditCardState =
  /** 스폰서 미확정(시안 pend). 폴백 가이드만 보여준다 */
  | "negotiating"
  /** 언락 이벤트가 아직 안 일어났다(lock) */
  | "locked"
  /** 언락됨, 받을 수 있다(ready) */
  | "available"
  /** 클레임했지만 배포 예정일 전이다(sched, C1 전용) */
  | "scheduled"
  /** 코드·링크가 전달됐다(sent) */
  | "delivered"
  /** 참가자가 「적용했어요」를 눌렀거나 스폰서가 확인해 줬다(ok) */
  | "confirmed"
  /** 유효기간이 지났거나 안 열린 채 시즌이 끝났다(exp) */
  | "expired"
  /** 시상 카드. 2차 심사 전(award) */
  | "award"
  /** 시상 카드. 2차 심사 확정(award fin) */
  | "awarded";

export type CreditCardStateInput = {
  kind: CreditKind;
  offerStatus: CreditOfferStatus;
  claimStatus: CreditClaimStatus | null;
  unlocked: boolean;
  season: CreditSeason;
  /** 참가가 살아 있는가(`entries.status`가 active). 탈락·실격·포기면 false */
  active: boolean;
  /** 카드의 유효기간이 지났는가(`creditLapsed`) */
  lapsed: boolean;
};

/**
 * 카드 한 장이 지금 어떤 얼굴인가.
 *
 * **순서가 규약이다**(canAccess와 같은 이유).
 *
 *   1. 시상 카드는 클레임 흐름 밖이다.
 *   2. 손에 들어온 발급 기록(예정·완료·확인·만료)은 카드가 어떻게 되든 남는다 —
 *      운영자가 카드를 협의 중으로 되돌려도 받은 코드는 받은 것이다. 다만
 *      유효기간이 지나면 받은 코드도 「만료」다(설계서 5장 「유효기간 종료 → 일괄
 *      만료 처리」). 행을 고치지 않고 읽을 때 접는다 — 날짜가 지났다는 사실은
 *      크론을 기다릴 까닭이 없다.
 *   3. 참가가 멈춘 팀(탈락·실격·포기)은 새로 받지 않는다 — 받은 것만 남고 나머지는
 *      「잠금」이다. 시안 ⑥(테스터 전환, C1만 받은 채 나머지 잠금)과 운영 표의
 *      실격 줄(「추가 발급 중지」, 안 받은 칸은 잠금)이 이 모양이다. 13 설계서
 *      3장 「탈락 팀은 C1까지만 보유」도 같은 말이다(2026-09-30).
 *   4. 협의 중은 **조건이 채워졌을 때만** 협의 중으로 읽힌다(시안 ⑤ 「협의 중,
 *      열림」). 레이스 중에 아직 안 열린 카드는 스폰서가 있든 없든 「잠금」이다
 *      (시안 ②③④의 C3) — 조건이 먼저다. 모집 중에는 아무것도 안 열리므로 전부
 *      「협의 중」이고(시안 ①), 시즌이 끝나면 못 연 채 「만료」다(⑦의 C3).
 *   5. 나머지는 조건과 카드가 닫혔는지로 가른다.
 *
 * ⚠️ 화면·받기·운영 칸·수동 발급이 **전부 이 함수 하나**를 부른다. 받기가 따로
 * 판정하던 때는 화면이 「발급 가능」인 카드를 받기가 거절하거나, 화면이 「만료」인
 * 카드를 받기가 내줬다(2026-09-30 감사).
 */
export function creditCardState(input: CreditCardStateInput): CreditCardState {
  const { kind, offerStatus, claimStatus, unlocked, season, active, lapsed } = input;
  const ended = offerStatus === CreditOfferStatus.ended || season === "over" || lapsed;

  /* 1) 시상 카드 */
  if (isAwardCard(kind)) {
    if (unlocked) return "awarded";
    if (offerStatus === CreditOfferStatus.negotiating && season === "pre") {
      return "negotiating";
    }
    return ended ? "expired" : "award";
  }

  /* 2) 발급 기록이 있으면 그 상태가 곧 카드 상태다 */
  switch (claimStatus) {
    case CreditClaimStatus.scheduled:
      return lapsed ? "expired" : "scheduled";
    case CreditClaimStatus.delivered:
      return lapsed ? "expired" : "delivered";
    case CreditClaimStatus.confirmed:
      return lapsed ? "expired" : "confirmed";
    case CreditClaimStatus.expired:
      return "expired";
    default:
      break;
  }

  /* 3) 참가가 멈춘 팀 — 받은 것만 남는다 */
  if (!active) return season === "over" ? "expired" : "locked";

  /* 4) 협의 중 — 열렸을 때만 협의 중이다 */
  if (offerStatus === CreditOfferStatus.negotiating) {
    if (season === "over") return "expired";
    return season === "pre" || unlocked ? "negotiating" : "locked";
  }

  /* 5) 기록이 없거나 받을 수 있는 채다 */
  if (!unlocked) return ended ? "expired" : "locked";
  return ended ? "expired" : "available";
}

/**
 * 「열린 혜택 n/4」에 세는 것 — 조건이 채워진 카드. 시안 `crRender`의 `last`와
 * 같은 규칙이다: 잠금·시상 대기는 아니고, 협의 중·만료는 조건이 채워졌을 때만.
 * 레일의 라임 선도 여기까지 내려온다.
 */
export function isOpenedCard(state: CreditCardState, unlocked: boolean): boolean {
  switch (state) {
    case "locked":
    case "award":
      return false;
    case "negotiating":
    case "expired":
      return unlocked;
    default:
      return true;
  }
}

/** 코드가 실제로 손에 들어온 카드 */
export function isDeliveredCard(state: CreditCardState): boolean {
  return state === "delivered" || state === "confirmed";
}

// ═════════════════════════════════════════════════════════════
// 시안의 일곱 판 — 지금 데이터가 그중 어느 것인가
// ═════════════════════════════════════════════════════════════

/** 시안 `.sb[data-cr]` 일곱 판 */
export type CreditsPane =
  | "pend"
  | "locked"
  | "sched"
  | "build"
  | "race"
  | "tester"
  | "end";

/**
 * 대조 스크립트와 개발 바가 「지금 어느 판인가」를 되짚는 데 쓴다. 화면은 이
 * 값으로 아무것도 안 바꾼다 — 판은 카드 상태의 결과이지 원인이 아니다.
 * 시안 목업 모양이 아니면 null이다.
 */
export function creditsPane(args: {
  season: CreditSeason;
  eliminated: boolean;
  cards: { kind: CreditKind; state: CreditCardState; unlocked: boolean }[];
}): CreditsPane | null {
  const { season, eliminated, cards } = args;
  if (season === "over") return "end";
  if (eliminated) return "tester";
  if (season === "pre") {
    return cards.every((c) => c.state === "negotiating") ? "pend" : null;
  }
  const of = (kind: CreditKind) => cards.find((c) => c.kind === kind);
  const c1 = of(CreditKind.c1);
  const c3 = of(CreditKind.c3);
  if (!c1 || !c3) return null;
  if (c1.state === "locked") return "locked";
  if (c1.state === "scheduled") return "sched";
  if (c3.state === "negotiating" && c3.unlocked) return "race";
  if (isDeliveredCard(c1.state) && c3.state === "locked") return "build";
  return null;
}

// ═════════════════════════════════════════════════════════════
// 예상 가치 합계 — 시안 「받은 크레딧 예상 가치 $125」
// ═════════════════════════════════════════════════════════════

/*
  `credit_offers.value`는 「$75」 같은 표기다. 시안은 열린 카드의 값을 더해
  보여준다. 통화가 섞이면 환산을 지어내야 하므로 **통화별로만** 더하고 나란히
  적는다(「$125 + ₩10,000」). 숫자로 못 읽는 표기는 합계에서 뺀다.
*/
const VALUE_RE = /^([^\d\s]+)\s?(\d[\d,]*)$/;

export function parseCreditValue(
  value: string | null,
): { currency: string; amount: number } | null {
  const m = value?.trim().match(VALUE_RE);
  if (!m) return null;
  const amount = Number(m[2].replace(/,/g, ""));
  return Number.isFinite(amount) ? { currency: m[1], amount } : null;
}

/** 합계 표기. 더할 수 있는 값이 하나도 없으면 null */
export function sumCreditValues(values: readonly (string | null)[]): string | null {
  const sums = new Map<string, number>();
  for (const value of values) {
    const parsed = parseCreditValue(value);
    if (!parsed) continue;
    sums.set(parsed.currency, (sums.get(parsed.currency) ?? 0) + parsed.amount);
  }
  if (sums.size === 0) return null;
  return [...sums]
    .map(([currency, amount]) => `${currency}${amount.toLocaleString("en-US")}`)
    .join(" + ");
}

/**
 * 「받은 크레딧 예상 가치」 칸. 열린 카드(시상 제외)의 값을 더한다.
 * 열린 것이 없어도 값이 정해진 카드가 있으면 「$0」(시안 ②), 아무것도 없으면
 * 「-」(시안 ①)이다.
 */
export function creditValueTotal(
  cards: readonly {
    kind: CreditKind;
    state: CreditCardState;
    unlocked: boolean;
    value: string | null;
  }[],
): string {
  const eligible = cards.filter((c) => !isAwardCard(c.kind));
  const opened = eligible
    .filter((c) => isOpenedCard(c.state, c.unlocked))
    .map((c) => c.value);
  const sum = sumCreditValues(opened);
  if (sum) return sum;
  const any = eligible.map((c) => parseCreditValue(c.value)).find((v) => v);
  return any ? `${any.currency}0` : "-";
}

// ═════════════════════════════════════════════════════════════
// 다음 언락 — 시안 `nx`
// ═════════════════════════════════════════════════════════════

export type NextUnlockCard = {
  kind: CreditKind;
  code: string;
  title: string;
  unlockEvent: CreditUnlockEvent;
};

/** 「다음 언락」 칸이 그릴 것. 문구는 content/credits.ts, 조립은 화면 */
export type NextUnlock =
  /** ① 전부 협의 중 */
  | { kind: "pre" }
  /** ③ 발급 예정 — 지급 예정일에 보낸다. C1은 `at`이 비고 게이트 1을 통과하면 보낸다 */
  | { kind: "scheduled"; card: NextUnlockCard; at: Date | null }
  /**
   * ②④⑤ 다음에 열릴 카드. `via`는 그 앞에 「협의 중이라 폴백으로 열렸어요」로
   * 한 번 언급하는 카드(⑤의 C3)
   */
  | { kind: "unlock"; card: NextUnlockCard; via: NextUnlockCard | null }
  /** ⑥ 테스터 전환 — `next`는 처음으로 잠긴 카드 */
  | { kind: "tester"; gate: 1 | 2; next: NextUnlockCard | null }
  /** ⑦ — `until`은 받은 코드 중 가장 이른 유효기간 */
  | { kind: "over"; until: Date | null }
  | { kind: "done" };

export function nextUnlock(args: {
  season: CreditSeason;
  eliminated: boolean;
  /** 못 넘은 게이트. 탈락일 때만 뜻이 있다 */
  failedGate: 1 | 2;
  cards: readonly (NextUnlockCard & {
    state: CreditCardState;
    unlocked: boolean;
    releaseDate: Date | null;
    validUntil: Date | null;
  })[];
}): NextUnlock {
  const { season, eliminated, failedGate, cards } = args;

  if (season === "over") {
    const until = cards
      .filter((c) => isDeliveredCard(c.state) && c.validUntil)
      .map((c) => c.validUntil as Date)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return { kind: "over", until: until ?? null };
  }
  if (eliminated) {
    return {
      kind: "tester",
      gate: failedGate,
      next: cards.find((c) => c.state === "locked") ?? null,
    };
  }
  if (season === "pre" && cards.every((c) => c.state === "negotiating")) {
    return { kind: "pre" };
  }

  /* C1은 날짜가 아니라 게이트 1이다(`releaseDue`) — 때를 비운다 */
  const scheduled = cards.find((c) => c.state === "scheduled");
  if (scheduled) {
    return {
      kind: "scheduled",
      card: scheduled,
      at: scheduled.kind === CreditKind.c1 ? null : scheduled.releaseDate,
    };
  }

  const via = cards.find((c) => c.state === "negotiating" && c.unlocked) ?? null;
  const next = cards.find((c) => c.state === "locked" || c.state === "award");
  if (next) return { kind: "unlock", card: next, via };
  return { kind: "done" };
}

// ═════════════════════════════════════════════════════════════
// 라벨
// ═════════════════════════════════════════════════════════════

export type CreditBadge = {
  label: string;
  tone: "lime" | "teal" | "gray";
  /** 점선 = 아직 확정 아님 */
  dashed?: boolean;
};

/** 시안 `CR_BADGE` */
export function creditBadge(
  state: CreditCardState,
  unlocked: boolean,
): CreditBadge {
  switch (state) {
    case "negotiating":
      /* 조건은 채웠는데 스폰서가 없다 — 참가자 잘못이 아니라는 표시가 필요하다 */
      return {
        label: unlocked ? "협의 중, 열림" : "협의 중",
        tone: "gray",
        dashed: true,
      };
    case "locked":
    case "award":
      return { label: "잠금", tone: "gray" };
    case "available":
      return { label: "발급 가능", tone: "lime" };
    case "scheduled":
      return { label: "발급 예정", tone: "lime", dashed: true };
    case "delivered":
      return { label: "발급 완료", tone: "lime" };
    case "confirmed":
      return { label: "발급 확인", tone: "teal" };
    case "expired":
      return { label: "만료", tone: "gray" };
    case "awarded":
      return { label: "시상 확정", tone: "lime" };
  }
}

export const CLAIM_STATUS_LABEL: Record<CreditClaimStatus, string> = {
  [CreditClaimStatus.available]: "발급 가능",
  [CreditClaimStatus.scheduled]: "발급 예정",
  [CreditClaimStatus.delivered]: "발급 완료",
  [CreditClaimStatus.confirmed]: "발급 확인",
  [CreditClaimStatus.expired]: "만료",
};

export const OFFER_STATUS_LABEL: Record<CreditOfferStatus, string> = {
  [CreditOfferStatus.negotiating]: "협의 중",
  [CreditOfferStatus.active]: "활성",
  [CreditOfferStatus.ended]: "종료",
};

export const UNLOCK_EVENT_LABEL: Record<CreditUnlockEvent, string> = {
  [CreditUnlockEvent.s1_submitted]: "s1 제출 완료",
  [CreditUnlockEvent.gate1_passed]: "게이트 1 통과",
  [CreditUnlockEvent.deploy_verified]: "배포 URL 검증 완료",
  [CreditUnlockEvent.final_confirmed]: "2차 심사 확정",
};

export const DELIVERY_LABEL: Record<CreditDelivery, string> = {
  [CreditDelivery.code_pool]: "코드 풀",
  [CreditDelivery.invite_link]: "초대 링크",
  [CreditDelivery.email_list]: "이메일 명단",
  [CreditDelivery.manual]: "수동",
};

// ═════════════════════════════════════════════════════════════
// 폴백 — 0원 스타트 스택
// ═════════════════════════════════════════════════════════════

/**
 * 스폰서가 없을 때 같은 루트를 무료 티어로 가는 안내.
 *
 * 카드마다 다르고 9/14 이후 바뀌므로 `credit_offers.fallback_items`(JSONB)에
 * 둔다. JSONB는 어떤 모양이든 들어가므로 **읽는 지점에서 검증한다**
 * (feature-flags.ts와 같은 규칙). 깨져 있으면 빈 목록으로 떨어뜨린다 —
 * 폴백이 안 그려지는 것이 화면이 안 뜨는 것보다 낫다.
 */
export type FallbackItem = { name: string; note?: string };

export function parseFallbackItems(raw: unknown): FallbackItem[] {
  if (!Array.isArray(raw)) return [];
  const items: FallbackItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const name = (entry as Record<string, unknown>)["name"];
    const note = (entry as Record<string, unknown>)["note"];
    if (typeof name !== "string" || !name.trim()) continue;
    items.push({
      name: name.trim(),
      ...(typeof note === "string" && note.trim() ? { note: note.trim() } : {}),
    });
  }
  return items;
}

// ═════════════════════════════════════════════════════════════
// 코드 표시
// ═════════════════════════════════════════════════════════════

/**
 * 발급 확인까지 끝난 코드는 가린다.
 *
 * 이미 쓴 코드라 화면에 통째로 띄워 둘 이유가 없다. 어깨 너머로 보이는 것도
 * 스크린샷에 남는 것도 스폰서 자산이 새는 경로다. 시안처럼 **마지막 앞 마디**를
 * 가려 「RPL-PRV-••••-M3XA」로 남긴다 — 앞뒤가 남아야 자기 코드인지 알아본다.
 * 마디가 없는 코드(링크 등)는 뒤 넷만 남기고 가린다.
 */
export function maskCreditCode(code: string): string {
  const spec = code.replace(/[A-Z0-9]{4}(?=-[A-Z0-9]{4}$)/, "••••");
  if (spec !== code) return spec;
  if (code.length <= 4) return code;
  const tail = code.slice(-4);
  /* 구분자는 살린다 — 모양이 남아야 자기 코드인지 알아본다 */
  const head = code.slice(0, -4).replace(/[^\s\-/.:]/g, "•");
  return head + tail;
}

export type CreditFailureCode =
  | "NOT_FOUND"
  | "LOCKED"
  | "INACTIVE"
  | "NEGOTIATING"
  | "ALREADY_CLAIMED"
  | "SOLD_OUT"
  | "ENDED";

/**
 * 받기를 막는 까닭 — 카드 상태가 「발급 가능」이 아니면 그 상태에 맞는 거절.
 * 받을 수 있으면 null. 참가가 멈춘 팀은 카드가 「잠금」으로 읽히지만 까닭은 따로 댄다.
 */
export function claimRefusal(
  state: CreditCardState,
  active: boolean,
): CreditFailureCode | null {
  switch (state) {
    case "available":
      return null;
    case "negotiating":
      return "NEGOTIATING";
    case "scheduled":
    case "delivered":
    case "confirmed":
      return "ALREADY_CLAIMED";
    case "expired":
      return "ENDED";
    default:
      return active ? "LOCKED" : "INACTIVE";
  }
}

export const CREDIT_FAILURE_MESSAGE: Record<CreditFailureCode, string> = {
  NOT_FOUND: "혜택을 찾을 수 없어요.",
  LOCKED: "아직 열리지 않은 혜택이에요.",
  INACTIVE: "참가가 멈춘 팀은 새로 받을 수 없어요. 이미 받은 크레딧은 그대로 써요.",
  NEGOTIATING: "스폰서 협의가 끝나지 않아 지금은 받을 수 없어요.",
  ALREADY_CLAIMED: "이미 받은 혜택이에요. 팀당 한 번만 받을 수 있어요.",
  SOLD_OUT: "남은 코드가 없어요. 운영에 알려 주시면 스폰서에 요청할게요.",
  ENDED: "종료된 혜택이에요.",
};
