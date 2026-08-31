import {
  CreditClaimStatus,
  CreditDelivery,
  CreditKind,
  CreditOfferStatus,
  CreditUnlockEvent,
} from "@/generated/prisma/enums";

/*
  혜택·크레딧의 **순수** 절반. 클라이언트도 읽는다(§8 · payment.ts와 같은 분리).

  근거는 13 크레딧 센터 설계서 v0.1(2026.08.22)이다. 그 문서가 고정한 것 넷 중
  둘이 여기 있다 — 카드가 무엇인지(3장)와 상태가 어떻게 바뀌는지(4장). 나머지
  둘(지급 흐름·폴백)은 credits-store.ts와 화면이 맡는다.

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
 * 팀이 지금까지 일으킨 사건들.
 *
 * `entry.stage` 하나로 넷을 다 판정하지 않는 이유는 배포 검증이다 — 그건 진도가
 * 아니라 hostnames의 검증 상태라서 s3에 와 있어도 아직 안 끝나 있을 수 있다.
 */
export type UnlockProgress = {
  s1Submitted: boolean;
  gate1Passed: boolean;
  deployVerified: boolean;
  finalConfirmed: boolean;
};

export function isUnlocked(
  event: CreditUnlockEvent,
  progress: UnlockProgress,
): boolean {
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

// ═════════════════════════════════════════════════════════════
// 카드 표시 상태 — 13 설계서 4장 두 표를 하나로 합친 값
// ═════════════════════════════════════════════════════════════

/*
  DB에는 표가 둘이다 — 카드 상태(credit_offers.status)와 발급 상태
  (credit_claims.status). 화면이 그리는 것은 그 둘의 **곱**이라, 화면마다
  곱셈을 다시 하면 반드시 어긋난다. 여기서 한 번 접어 여덟 값으로 만든다.
*/
export type CreditCardState =
  /** 스폰서 미확정. 언락과 무관하게 폴백 가이드만 보여준다 */
  | "negotiating"
  /** 언락 이벤트가 아직 안 일어났다 */
  | "locked"
  /** 언락됨, 받을 수 있다 */
  | "available"
  /** 클레임했지만 배포 예정일 전이다(C1 전용) */
  | "scheduled"
  /** 코드·링크가 전달됐다 */
  | "delivered"
  /** 참가자가 「적용했어요」를 눌렀거나 스폰서가 확인해 줬다 */
  | "confirmed"
  /** 유효기간이 지났거나 안 열린 채 시즌이 끝났다 */
  | "expired"
  /** 시상 카드. 2차 심사 전 */
  | "award"
  /** 시상 카드. 2차 심사 확정 */
  | "awarded";

export type CreditCardStateInput = {
  kind: CreditKind;
  offerStatus: CreditOfferStatus;
  claimStatus: CreditClaimStatus | null;
  unlocked: boolean;
};

/**
 * 카드 한 장이 지금 어떤 얼굴인가.
 *
 * **순서가 규약이다**(canAccess와 같은 이유). 협의 중을 맨 앞에 두는 것은
 * 설계서 4장의 전이 규칙 마지막 줄 때문이다 — "카드가 협의 중이면 언락이
 * 발생해도 클레임 버튼 대신 폴백 가이드를 보여줌". 이 줄을 뒤로 미루면
 * 스폰서가 없는데 「크레딧 받기」 버튼이 서고, 누르면 줄 것이 없다.
 */
export function creditCardState(input: CreditCardStateInput): CreditCardState {
  const { kind, offerStatus, claimStatus, unlocked } = input;

  /* 1) 시상 카드는 클레임 흐름 밖이다 */
  if (isAwardCard(kind)) return unlocked ? "awarded" : "award";

  /* 2) 협의 중 — 언락되어도 폴백이 먼저다 */
  if (offerStatus === CreditOfferStatus.negotiating) return "negotiating";

  /* 3) 발급 기록이 있으면 그 상태가 곧 카드 상태다 */
  if (claimStatus) {
    switch (claimStatus) {
      case CreditClaimStatus.available:
        /* 카드가 닫힌 뒤에는 받을 수 없다. 열려 있던 흔적만 남는다 */
        return offerStatus === CreditOfferStatus.ended
          ? "expired"
          : "available";
      case CreditClaimStatus.scheduled:
        return "scheduled";
      case CreditClaimStatus.delivered:
        return "delivered";
      case CreditClaimStatus.confirmed:
        return "confirmed";
      case CreditClaimStatus.expired:
        return "expired";
    }
  }

  /* 4) 기록이 없다 — 안 열렸거나(잠금), 열리기 전에 카드가 닫혔거나(만료) */
  if (!unlocked) {
    return offerStatus === CreditOfferStatus.ended ? "expired" : "locked";
  }
  return offerStatus === CreditOfferStatus.ended ? "expired" : "available";
}

/** 「열린 혜택 n/4」에 세는 것. 잠금·시상 대기는 열린 것이 아니다 */
export function isOpenedCard(state: CreditCardState): boolean {
  return (
    state === "available" ||
    state === "scheduled" ||
    state === "delivered" ||
    state === "confirmed" ||
    state === "awarded"
  );
}

/** 코드가 실제로 손에 들어온 카드. 예상 가치 합계는 이것만 센다 */
export function isDeliveredCard(state: CreditCardState): boolean {
  return state === "delivered" || state === "confirmed";
}

// ═════════════════════════════════════════════════════════════
// 라벨
// ═════════════════════════════════════════════════════════════

export type CreditBadge = {
  label: string;
  tone: "lime" | "teal" | "neutral";
  /** 점선 = 아직 확정 아님 */
  dashed?: boolean;
};

export function creditBadge(
  state: CreditCardState,
  unlocked: boolean,
): CreditBadge {
  switch (state) {
    case "negotiating":
      /* 조건은 채웠는데 스폰서가 없다 — 참가자 잘못이 아니라는 표시가 필요하다 */
      return {
        label: unlocked ? "협의 중, 열림" : "협의 중",
        tone: "neutral",
        dashed: true,
      };
    case "locked":
      return { label: "잠금", tone: "neutral" };
    case "available":
      return { label: "발급 가능", tone: "lime" };
    case "scheduled":
      return { label: "발급 예정", tone: "lime", dashed: true };
    case "delivered":
      return { label: "발급 완료", tone: "lime" };
    case "confirmed":
      return { label: "발급 확인", tone: "teal" };
    case "expired":
      return { label: "만료", tone: "neutral" };
    case "award":
      return { label: "잠금", tone: "neutral" };
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
 * 스크린샷에 남는 것도 스폰서 자산이 새는 경로다. 마지막 마디만 남겨
 * "그 코드가 맞다"를 확인할 수 있게 한다.
 */
export function maskCreditCode(code: string): string {
  if (code.length <= 4) return code;
  const tail = code.slice(-4);
  /* 구분자는 살린다 — 모양이 남아야 자기 코드인지 알아본다 */
  const head = code.slice(0, -4).replace(/[^\s-]/g, "•");
  return head + tail;
}

export type CreditFailureCode =
  | "NOT_FOUND"
  | "LOCKED"
  | "NEGOTIATING"
  | "ALREADY_CLAIMED"
  | "SOLD_OUT"
  | "ENDED";

export const CREDIT_FAILURE_MESSAGE: Record<CreditFailureCode, string> = {
  NOT_FOUND: "혜택을 찾을 수 없어요.",
  LOCKED: "아직 열리지 않은 혜택이에요.",
  NEGOTIATING: "스폰서 협의가 끝나지 않아 지금은 받을 수 없어요.",
  ALREADY_CLAIMED: "이미 받은 혜택이에요. 팀당 한 번만 받을 수 있어요.",
  SOLD_OUT: "남은 코드가 없어요. 운영에 알려 주시면 스폰서에 요청할게요.",
  ENDED: "종료된 혜택이에요.",
};
