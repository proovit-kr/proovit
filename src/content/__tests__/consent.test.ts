import { describe, expect, it } from "vitest";

import {
  ACCOUNT_MARKETING_CONSENT_VERSION,
  MARKETING_CONSENT_VERSION,
  PREREGISTER_CONSENTS,
  PRIVACY_CONSENT_VERSION,
  SIGNUP_CONSENTS,
} from "@/content/consent";

/*
  사전 신청 폼의 동의 문안 — 정본은 노션 「사전신청 폼 문안·푸터 — 게시용 최종본」
  1·2·3절이고, 2026-10-10 윤서 요청으로 화면이 그 문서대로 맞춰졌다.

  여기서 지키는 것은 **받는 방식**(D1~D5)과 **고지 4요소**다. 문구 자체는 팀장
  소관이라 글자를 박아 두지 않고, 요소가 빠지거나 자리가 바뀌는 것만 잡는다.
*/

const item = (key: string) => PREREGISTER_CONSENTS.find((c) => c.key === key);

describe("사전 신청 동의", () => {
  it("항목은 privacy·age·marketing 순이고 선택은 marketing 하나다 (D2·D4)", () => {
    expect(PREREGISTER_CONSENTS.map((c) => c.key)).toEqual([
      "privacy",
      "age",
      "marketing",
    ]);
    expect(PREREGISTER_CONSENTS.filter((c) => !c.required).map((c) => c.key)).toEqual([
      "marketing",
    ]);
  });

  it("개인정보 수집·이용은 그 자리에서 펼치고, 표 뒤에 방침 링크가 있다", () => {
    const privacy = item("privacy");
    expect(privacy?.disclosure).toBe(true);
    /* 펼침이면 「보기」가 이동 링크가 아니다 — 둘을 같이 두면 어느 쪽인지 모른다 */
    expect(privacy?.policyHref).toBeUndefined();

    const labels = privacy?.facts?.map((f) => f.label) ?? [];
    expect(labels).toEqual(["수집 항목", "수집·이용 목적", "보유·이용 기간"]);
    /* D3 — 보유·이용 기간은 굵게 구분한다 */
    expect(privacy?.facts?.find((f) => f.label === "보유·이용 기간")?.important).toBe(true);
    /* 거부권 */
    expect(privacy?.notes?.some((n) => n.includes("거부할 권리"))).toBe(true);
    /* 「개인정보처리방침」 링크는 본문 **마지막** 문장에 든다 */
    expect(privacy?.notes?.at(-1)).toMatch(/\[개인정보처리방침\]\(\/privacy\)/);
  });

  it("만 14세는 펼침 없이 라벨 아래 한 줄만 있다", () => {
    const age = item("age");
    expect(age?.disclosure).toBeFalsy();
    expect(age?.policyHref).toBeUndefined();
    expect(age?.hint).toBe("PROOVIT은 만 14세 이상만 신청할 수 있어요.");
  });

  it("광고성 정보 수신은 라벨이 「광고성 정보」이고 4요소를 펼친다", () => {
    const marketing = item("marketing");
    expect(marketing?.label).toBe("[선택] 광고성 정보 수신 동의 (이메일)");
    expect(marketing?.disclosure).toBe(true);

    const labels = marketing?.facts?.map((f) => f.label) ?? [];
    expect(labels).toEqual(["전송 매체", "이용 항목", "이용 목적", "보유·이용 기간"]);
    expect(marketing?.facts?.find((f) => f.label === "보유·이용 기간")?.important).toBe(true);
    /* 철회 방법 */
    expect(marketing?.notes?.some((n) => n.includes("수신거부"))).toBe(true);
  });

  /*
    ⚠️ 문안이 바뀌면 버전을 올린다(consent.ts 머리 주석). 10-10에 사전 신청의
    마케팅 문안만 바뀌었고 가입 모달은 그대로라, 둘의 버전이 **갈라져야** 한다.
    같은 값으로 돌아가면 모달 쪽이 보지도 않은 문안의 버전을 기록하게 된다.
  */
  it("마케팅 문안 버전은 사전 신청과 가입 모달이 갈라져 있다", () => {
    expect(MARKETING_CONSENT_VERSION).toBe("v1.1");
    expect(ACCOUNT_MARKETING_CONSENT_VERSION).toBe("v1.0");
    expect(SIGNUP_CONSENTS.find((c) => c.key === "marketing")?.label).toBe(
      "[선택] 마케팅 정보 수신 동의 (이메일)",
    );
  });

  /* 고지 4요소는 방침과 같은 넷이라 펼친 자리만 바뀌었다 — 재동의 대상이 아니다 */
  it("개인정보 수집·이용 문안 버전은 v1.0 그대로다", () => {
    expect(PRIVACY_CONSENT_VERSION).toBe("v1.0");
  });
});
