import { z } from "@/lib/z";

/*
  결제 연동의 **순수** 절반. 클라이언트도 읽는다(CLAUDE.md §8).

  시안 ①(ver4, 2026-09-10)대로 **조회 전용 키**를 받는다. 저장은 payment-crypto.ts가
  잠근다 — 평문은 DB에 남지 않고, 화면에는 가린 모양(`maskKey`)만 나간다.
  웹훅 시크릿은 웹훅 경로가 붙을 때 같은 방식으로 받는다.

  2026-08-15~09-22에는 키를 안 받고 상점 아이디를 받았다(dc9ab65, 암호화 키가 없다는
  내 판단). ver4가 더 나중이라 시안을 따른다(09-22 수연 지시). `merchant_id` 칸은
  그때 것이라 지금은 안 쓴다.
*/

export const PROVIDERS = [
  { value: "toss", label: "토스페이먼츠" },
  { value: "portone", label: "포트원" },
] as const;

export const READONLY_KEY_MAX = 255;

/**
 * 조회 전용 키. 비밀값이라 화면에 되돌려 주지 않는다 — 검사에 걸려도 값은 비운다.
 */
export const ReadonlyKeySchema = z
  .string()
  .trim()
  .min(1, "조회키를 붙여 넣어 주세요.")
  .max(READONLY_KEY_MAX, `${READONLY_KEY_MAX}자까지 쓸 수 있어요.`)
  /* 공백이 섞여 들어오면 결제사 호출이 조용히 실패한다. 눈에 안 보이는 실수라 여기서 막는다 */
  .refine(
    (value) => !/\s/.test(value),
    "공백 없이 붙여 주세요. 복사할 때 앞뒤 공백이 딸려오는 일이 잦아요.",
  )
  .refine((value) => value.length >= 12, "너무 짧아요. 발급받은 키를 그대로 붙여 넣어 주세요.");

/**
 * 시안 ②의 「sk_live_••••••••3f2a」 — 접두(`xx_yyyy_` 꼴이면 그것, 아니면 앞 3자) +
 * 가림 8자 + 끝 4자. 접두와 끝만으로는 키를 되살릴 수 없다.
 */
export function maskKey(key: string): string {
  const prefix = key.match(/^[A-Za-z]+_[A-Za-z]+_/)?.[0] ?? key.slice(0, 3);
  return `${prefix}••••••••${key.slice(-4)}`;
}

export type PaymentFailureCode = "NOT_FOUND" | "LOCKED" | "UNREADABLE" | "NO_HOSTNAME";

export const PAYMENT_FAILURE_MESSAGE: Record<PaymentFailureCode, string> = {
  NOT_FOUND: "참가 기록을 찾을 수 없어요.",
  LOCKED: "연동 확인이 끝난 뒤에는 바꿀 수 없어요. 운영에 문의해 주세요.",
  UNREADABLE: "저장된 키를 읽을 수 없어요. 키를 다시 등록해 주세요.",
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

/*
  시안 ③ 요약의 「현재 단계」 — L1~L4 중 지금 어디까지 왔나.

  L1은 문의 수단이 등록돼 문의 도달 이벤트를 기록할 수 있는 상태, L2부터는 유효
  문의 건수다. L3·L4(상담 3건·구매의향·계약)는 s5 제출의 증빙을 심사가 보고 정하는
  것이라 여기서는 못 올린다 — 그래서 이 함수의 최대는 L2다.
*/
export function inquiryStage(row: {
  inquiryUrl: string | null;
  validInquiries: number;
}): string {
  if (!row.inquiryUrl) return "문의 수단 등록 전";
  if (row.validInquiries >= 1) return `L2, 유효 문의 ${row.validInquiries}건`;
  return "L1, 문의 수단 등록됨";
}
