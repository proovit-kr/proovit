import { z } from "@/lib/z";

/*
  결제 연동의 **순수** 절반. 클라이언트도 읽는다(CLAUDE.md §8).

  ⚠️ **키를 받지 않는다.** 스키마의 `readonly_key_enc`·`webhook_secret_enc`는 이름이
  말하듯 암호화 저장을 전제하는데, 그 암호화 키가 아직 없다. 평문으로 받아두고
  "나중에 암호화하자"로 두면 그 사이에 유출되는 것은 참가팀의 PG 자격증명이다 —
  우리 것이 아니라 남의 것이라 더 위험하다.

  그래서 지금 받는 것은 **비밀이 아닌 값**뿐이다: 어느 PG를 쓰는지, 상점 아이디가
  무엇인지. 웹훅 시크릿·조회 키는 암호화 저장이 붙은 뒤에 연다.
  Turnstile 키가 없으면 위젯을 통째로 건너뛰는 것과 같은 판단이다.
*/

export const PROVIDERS = [
  {
    value: "toss",
    label: "토스페이먼츠",
    hint: "개발자센터의 「내 상점」에서 확인할 수 있어요.",
  },
  {
    value: "portone",
    label: "포트원",
    hint: "콘솔의 「상점 식별코드」예요.",
  },
] as const;

export const MERCHANT_ID_MAX = 120;

/**
 * 상점 아이디.
 *
 * 비밀값이 아니다 — 결제창을 여는 스크립트에 그대로 실리는 공개 식별자다.
 * 그래서 평문으로 저장해도 되고, 매출 대사(對査) 때 어느 상점 건인지 가리는
 * 근거가 된다.
 */
export const MerchantIdSchema = z
  .string()
  .trim()
  .min(1, "상점 아이디를 적어 주세요.")
  .max(MERCHANT_ID_MAX, `${MERCHANT_ID_MAX}자까지 쓸 수 있어요.`)
  /* 공백이 섞여 들어오면 대사에서 안 맞는다. 눈에 안 보이는 실수라 여기서 막는다 */
  .refine(
    (value) => !/\s/.test(value),
    "공백 없이 붙여 주세요. 복사할 때 앞뒤 공백이 딸려오는 일이 잦아요.",
  );

export type PaymentFailureCode = "NOT_FOUND" | "LOCKED" | "NO_HOSTNAME";

export const PAYMENT_FAILURE_MESSAGE: Record<PaymentFailureCode, string> = {
  NOT_FOUND: "참가 기록을 찾을 수 없어요.",
  LOCKED: "연동 확인이 끝난 뒤에는 바꿀 수 없어요. 운영에 문의해 주세요.",
  NO_HOSTNAME: "먼저 측정 연동에서 팀 주소를 발급받아 주세요.",
};

/*
  ── 시안 `#scr-payment`의 판 ───────────────────────────────

  시안은 셋이다 — ① 결제형 미등록 · ② 결제형 등록과 테스트 완료 · ③ 문의형.
  과금 유형은 s1 제출값(entries.charge_type)이고 심사 중 바꿀 수 없다.

  `pending`은 시안에 없다 — 등록은 했는데 아직 확인(verified)이 안 난 사이다.
  ②의 모양을 그대로 쓰고 배지만 회색 「확인 대기」다(내가 정함, 2026-09-22,
  수연 확인 대기). 화면·개발 바·대조 스크립트가 같은 판정을 쓴다.
*/
export type PaymentPane = "none" | "pending" | "ok" | "inq";

export function paymentPane(row: {
  chargeType: string;
  status: string | null;
}): PaymentPane {
  if (row.chargeType === "inquiry") return "inq";
  if (row.status === "verified") return "ok";
  if (row.status === null || row.status === "disabled") return "none";
  return "pending";
}

/** 시안 ③의 수익화 단계 표(L1~L4). 심사 기준서의 문의형 트랙이다 */
export const INQUIRY_LEVELS = [
  { k: "L1", text: "가격(안) 공개 + 문의 수단 작동, 문의 도달 이벤트 기록", pt: 25 },
  { k: "L2", text: "유효 문의 1건 이상", pt: 50 },
  { k: "L3", text: "유효 상담 3건 이상 또는 서면 구매의향 1건", pt: 75 },
  { k: "L4", text: "계약 체결 또는 유료 파일럿 1건", pt: 100 },
] as const;

export const INQUIRY_URL_MAX = 500;

/**
 * 문의 수단 주소. **팀 주소 아래 경로만** 받는다(시안 ③ 「팀명.proovit.kr 경로만
 * 인정」) — 문의 도달 이벤트가 팀 주소 경유 접속으로 세어지기 때문이다.
 * 팀 주소가 아직 없으면 무엇을 적어도 받을 수 없다.
 */
export function inquiryUrlSchema(hostname: string | null) {
  return z
    .string()
    .trim()
    .min(1, "문의 수단 주소를 적어 주세요.")
    .max(INQUIRY_URL_MAX, `${INQUIRY_URL_MAX}자까지 쓸 수 있어요.`)
    .refine((value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    }, "https://로 시작하는 주소를 적어 주세요.")
    .refine(
      (value) => hostname !== null && new URL(value).hostname === hostname,
      hostname
        ? `${hostname} 아래 경로만 인정돼요.`
        : "먼저 측정 연동에서 팀 주소를 발급받아 주세요.",
    );
}

/** 시안 ②의 「마지막 테스트 10.21 14:02」 — 서울 시각, 월.일 시:분 */
export function formatSeoulShort(date: Date): string {
  const part = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${part.month}.${part.day} ${part.hour}:${part.minute}`;
}
