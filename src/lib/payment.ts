import { z } from "zod";

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
    hint: "상점 아이디는 개발자센터의 「내 상점」에서 확인합니다.",
  },
  {
    value: "portone",
    label: "포트원",
    hint: "상점 아이디는 콘솔의 「상점 식별코드」입니다.",
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
    "공백 없이 붙여 주세요. 복사할 때 앞뒤 공백이 딸려오는 일이 잦습니다.",
  );

export type PaymentFailureCode = "NOT_FOUND" | "LOCKED";

export const PAYMENT_FAILURE_MESSAGE: Record<PaymentFailureCode, string> = {
  NOT_FOUND: "참가 기록을 찾을 수 없어요.",
  LOCKED: "연동 확인이 끝난 뒤에는 바꿀 수 없어요. 운영에 문의해 주세요.",
};
