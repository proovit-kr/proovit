import { CreditUnlockEvent } from "@/generated/prisma/enums";

/*
  혜택과 크레딧 화면의 문안 — 시안 ver4 `#scr-credits`(CR_CARDS·CR_STATES·crCard)가
  정본이다. 화면(app/dashboard/credits)이 이 값을 그대로 그린다.

  ⚠️ 카드의 본문·폴백 목록·적용 안내는 여기 없다 — 스폰서마다 다르고 9/14
  go/no-go 뒤에 정해지는 값이라 `credit_offers`에 있다(lib/credits.ts 머리 주석).
  여기 있는 것은 카드가 어떤 상태든 같은 말이다.
*/

export const CREDITS_HEAD = {
  title: "혜택과 크레딧",
  sub: "혜택은 스테이지를 통과할 때 열려요. 크레딧은 빌드 시작일에 보내드려요.",
} as const;

/** 제목 아래 한 줄. ⑥ 테스터 전환은 경고줄, ⑦ 시즌 종료는 안내줄 */
export const CREDITS_NOTE = {
  /** `{gate}`는 못 넘은 게이트 번호와 조사(「1을」·「2를」), `{cards}`는 받은 카드 코드(「C1」) */
  tester:
    "게이트 {gate} 통과하지 못해 테스터로 전환됐어요. 받은 {cards} 크레딧은 유효기간까지 그대로 쓸 수 있어요.",
  testerNone: "게이트 {gate} 통과하지 못해 테스터로 전환됐어요. 받은 크레딧은 없어요.",
  over: "시즌이 끝났어요. 받은 코드는 유효기간까지 그대로 쓰고, 열리지 않은 카드는 만료됐어요.",
} as const;

export const CREDITS_SUM = {
  opened: "열린 혜택",
  value: "받은 크레딧 예상 가치",
  next: "다음 언락",
} as const;

/** 「다음 언락」 칸. `<b>`·`.mono` 자리는 화면이 조각으로 그린다 */
export const CREDITS_NEXT = {
  /** ① 전부 협의 중 — 「₩0」이 mono */
  pre: ["스폰서 확정 전이에요. 지금은 ", "₩0", " 스타트 스택으로 같은 루트를 갈 수 있어요."],
  /** ③ 발급 예정 — `{code}`는 카드 코드, 날짜가 mono */
  scheduled: ["{code}은 빌드 시작일 ", "에 보내드려요"],
  /** ⑤ 협의 중인데 열림 — 다음 카드 문장 앞에 붙는다 */
  negotiatingOpen: "{code}는 스폰서 협의 중이라 폴백으로 열렸어요. ",
  /** ⑥ `{gate}`는 게이트 번호, `{code}`는 처음 잠긴 카드 */
  tester: ["게이트 {gate}", " 미통과로 테스터로 전환됐어요. {code}부터는 다음 시즌에 열려요"],
  testerNone: ["게이트 {gate}", " 미통과로 테스터로 전환됐어요. 받은 크레딧은 유효기간까지 그대로 써요"],
  /** ⑦ 날짜가 mono */
  over: ["시즌이 끝났어요. 받은 코드는 ", "까지 그대로 써요"],
  overNone: "시즌이 끝났어요. 열리지 않은 카드는 만료됐어요",
  done: "열 수 있는 카드를 다 열었어요",
} as const;

/**
 * 언락 사건별 「다음 언락」 문장 — `<b>{key}</b>{rest}`.
 * s1·배포·2차 심사는 시안 ②④⑤ 그대로, 게이트 1은 같은 꼴로 맞췄다(내가 정함, 2026-09-23).
 * `{code}`·`{title}`은 그 카드의 것.
 */
export const CREDITS_UNLOCK: Record<CreditUnlockEvent, { key: string; rest: string }> = {
  [CreditUnlockEvent.s1_submitted]: { key: "s1 제출", rest: "을 마치면 {code} {title}이 열려요" },
  [CreditUnlockEvent.gate1_passed]: { key: "게이트 1", rest: "을 통과하면 {code} {title}가 열려요" },
  [CreditUnlockEvent.deploy_verified]: { key: "배포 URL 검증", rest: "이 끝나면 {code} {title}이 열려요" },
  [CreditUnlockEvent.final_confirmed]: { key: "2차 심사", rest: "가 확정되면 시상 크레딧이 안내돼요" },
};

/** 카드 한 장 안의 고정 문구 */
export const CREDIT_CARD_TEXT = {
  sponsorNone: "스폰서 미정",
  condLocked: "열리는 조건, ",
  meta: { value: "예상 가치", release: "지급 시점", valid: "유효기간" },
  negotiating: "협의 중",
  /** 「$75」 뒤 */
  worth: "상당",
  /** 배포 예정일이 있을 때 앞에 붙는 말. C1만 그렇다(빌드 스테이지 개시일) */
  releaseLabel: "빌드 시작일",
  /** 배포 예정일이 없으면 사건이 곧 지급이다 */
  releaseImmediate: {
    [CreditUnlockEvent.s1_submitted]: "제출 즉시",
    [CreditUnlockEvent.gate1_passed]: "통과 즉시",
    [CreditUnlockEvent.deploy_verified]: "검증 즉시",
    [CreditUnlockEvent.final_confirmed]: "확정 즉시",
  } as Record<CreditUnlockEvent, string>,
  none: "-",
  fallback: { title: "폴백, ", zero: "₩0", stack: " 스타트 스택", sub: "같은 루트를 무료 티어로 가요" },
  /** 상태별 행동 줄 */
  pendAward: "스폰서가 확정되면 표시돼요. 확정 전까지는 시상 크레딧이 없는 것으로 안내해요.",
  pend: {
    guide: "폴백 가이드 열기",
    status: "협의 현황 보기",
    open: "조건은 충족됐어요, 스폰서가 확정되면 바로 열려요",
  },
  lock: { claim: "크레딧 받기", cond: "조건 자세히" },
  sched: {
    line: ["빌드 시작일 ", "에 이메일로 보내드려요"],
    mail: "받을 이메일 확인",
    when: "코드는 스폰서가 빌드 개시일에 맞춰 발급해요",
  },
  ready: { claim: "크레딧 받기", how: "적용 방법", when: "받기를 누르면 이메일로도 보내드려요" },
  sent: {
    copy: "복사",
    how: "적용 방법",
    /** `{at}`은 「10.12 09:00」, 뒤에 적용 안내가 붙는다 */
    line: "이메일 발송 ",
    applied: "적용했어요",
    confirmed: "적용 확인됨, 잘 쓰고 있는지 스폰서도 같이 봐요",
  },
  exp: {
    noSponsor: "스폰서 협의가 안 돼 폴백으로 운영됐어요. 시즌 종료로 닫혔어요",
    opened: "유효기간이 끝났어요",
    never: "열리지 않은 채 시즌이 끝났어요",
  },
  award: "2차 심사가 확정된 뒤에 안내돼요. 여기서 받는 게 아니라 시상 절차로 가요.",
  awarded: { guide: "시상 안내 보기", when: ["확정 ", ", 상금 규정과 세금 안내가 함께 가요"] },
} as const;

export const CREDITS_FOOT = [
  { b: "팀당 1회 발급.", text: " 코드는 스폰서가 만들고 프루빗은 전달과 확인만 해요. 코드 발급을 위해 스폰서에 이름과 이메일을 넘기는 건 참가 신청 때 따로 동의한 팀만이에요." },
  { b: "상금과는 별개.", text: " C1부터 C3까지는 참가를 돕는 자원이고, 시상 크레딧만 상금 규정이 적용돼요." },
] as const;

export const CREDITS_TOAST = {
  claimed: "코드를 보냈어요, 이메일도 확인해 주세요",
  confirmed: "적용 확인됐어요",
  unconfirmed: "적용 확인을 취소했어요",
  copied: "코드를 복사했어요",
  copyFailed: "직접 선택해 복사해 주세요",
} as const;
