import { describe, expect, it } from "vitest";

import { ReadonlyKeySchema, inquiryStage, maskKey, paymentPane } from "@/lib/payment";

/*
  결제 연동 화면의 판은 과금 유형(s1 제출값)과 연동 행의 상태를 접은 것이다.
  화면·개발 바·대조 스크립트가 이 하나를 같이 쓰므로 표가 먼저다.
*/
describe("결제 연동 판 판정", () => {
  it("문의형은 연동 행이 있어도 ③이다", () => {
    expect(paymentPane({ chargeType: "inquiry", status: "verified" })).toBe("inq");
    expect(paymentPane({ chargeType: "inquiry", status: null })).toBe("inq");
  });

  it("결제형은 행 없음·사용 안 함이 ①, 확인됨이 ②, 그 사이가 확인 대기다", () => {
    expect(paymentPane({ chargeType: "payment", status: null })).toBe("none");
    expect(paymentPane({ chargeType: "payment", status: "disabled" })).toBe("none");
    expect(paymentPane({ chargeType: "payment", status: "verified" })).toBe("ok");
    expect(paymentPane({ chargeType: "payment", status: "pending" })).toBe("pending");
    expect(paymentPane({ chargeType: "payment", status: "failed" })).toBe("pending");
  });
});

describe("조회키 가리기 — 시안 ② 「sk_live_••••••••3f2a」", () => {
  it("xx_yyyy_ 접두는 살리고 끝 4자만 보인다", () => {
    expect(maskKey("sk_live_sandbox_only_3f2a")).toBe("sk_live_••••••••3f2a");
  });

  it("접두 꼴이 아니면 앞 3자만", () => {
    expect(maskKey("abcdefghijkl9999")).toBe("abc••••••••9999");
  });
});

describe("조회키 검사", () => {
  it("공백이 섞이면 거부", () => {
    expect(ReadonlyKeySchema.safeParse("sk_live_ab cd1234").success).toBe(false);
  });
  it("앞뒤 공백은 잘라서 받는다", () => {
    const r = ReadonlyKeySchema.safeParse("  sk_live_abcdef123456  ");
    expect(r.success && r.data).toBe("sk_live_abcdef123456");
  });
  it("너무 짧으면 거부", () => {
    expect(ReadonlyKeySchema.safeParse("sk_live_1").success).toBe(false);
  });
});

describe("문의형 현재 단계 — 시안 ③ 「L2, 유효 문의 2건」", () => {
  it("주소 없으면 등록 전, 있으면 L1, 유효 문의가 있으면 L2와 건수", () => {
    expect(inquiryStage({ inquiryUrl: null, validInquiries: 5 })).toBe("문의 수단 등록 전");
    expect(inquiryStage({ inquiryUrl: "https://a.proovit.kr/c", validInquiries: 0 })).toBe("L1, 문의 수단 등록됨");
    expect(inquiryStage({ inquiryUrl: "https://a.proovit.kr/c", validInquiries: 2 })).toBe("L2, 유효 문의 2건");
  });
});
