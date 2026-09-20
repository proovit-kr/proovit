import { describe, expect, it } from "vitest";

import {
  PRELAUNCH_PRIVACY_POLICY,
  SEASON1_PRIVACY_POLICY,
  privacyPolicyAt,
} from "@/content/privacy";

/*
  개인정보처리방침이 둘이고 시행일로 갈린다(2026-09-21 수연 결정).

  여기서 지키는 것은 두 가지다. **언제 무엇이 보이는가**와, 시안을 다시
  이식할 때 **일부러 다르게 쓴 자리가 되돌아가지 않는가**.
*/

const kst = (s: string) => new Date(`${s}+09:00`);

describe("privacyPolicyAt", () => {
  it("첫 방침 시행 전에는 아무것도 고르지 않는다", () => {
    expect(privacyPolicyAt(kst("2026-08-30T23:59:00"))).toBeNull();
  });

  it("사전 신청 기간에는 전문을 고른다", () => {
    const p = privacyPolicyAt(kst("2026-09-21T10:00:00"));
    expect(p).toBe(PRELAUNCH_PRIVACY_POLICY);
    expect(p?.effectiveDate).toBe("2026-08-31");
  });

  /*
    ⚠️ 이 테스트가 잡는 것은 `new Date("2026-09-28")`이다. 그렇게 쓰면 UTC
    자정으로 읽혀 KST로는 9월 27일 09:00부터 새 방침이 걸린다. 시행일을 하루
    앞당기는 종류의 실수라 시각을 그 자리에 두고 본다.
  */
  it("시행일 전날 낮에는 아직 전문이다", () => {
    expect(privacyPolicyAt(kst("2026-09-27T12:00:00"))).toBe(
      PRELAUNCH_PRIVACY_POLICY,
    );
  });

  it("시행일 직전 1분까지 전문이고, 자정부터 게시본이다", () => {
    expect(privacyPolicyAt(kst("2026-09-27T23:59:00"))).toBe(
      PRELAUNCH_PRIVACY_POLICY,
    );
    expect(privacyPolicyAt(kst("2026-09-28T00:00:00"))).toBe(
      SEASON1_PRIVACY_POLICY,
    );
  });

  it("시즌이 끝난 뒤에도 게시본이 남는다", () => {
    expect(privacyPolicyAt(kst("2026-12-31T00:00:00"))).toBe(
      SEASON1_PRIVACY_POLICY,
    );
  });
});

describe("시즌1 게시본이 시안과 다르게 쓴 자리", () => {
  const policy = SEASON1_PRIVACY_POLICY;

  /*
    제7조 표의 「국가」 칸은 법인 소재지가 아니라 데이터가 가는 곳이다
    (법 제28조의8 제1항 제3호). 시안은 여섯 줄을 모두 「미국」으로 적지만
    Neon·Upstash의 저장 리전은 싱가포르다 — `privacy.ts` 머리 주석 참조.

    제7조 ①은 이 표의 공개로 별도 동의를 **갈음**한다. 갈음의 근거가 되는
    사실이 틀리면 그 이전에 대한 갈음이 성립하지 않으므로, 시안을 다시
    옮길 때 조용히 「미국」으로 돌아가는 일을 여기서 막는다.
  */
  it("제7조의 저장 리전이 싱가포르로 남아 있다", () => {
    const article = policy?.articles.find((a) => a.no === 7);
    const block = article?.blocks.find((b) => b.kind === "table");
    expect(block?.kind).toBe("table");
    if (block?.kind !== "table") return;

    const country = Object.fromEntries(
      block.table.rows.map((r) => [r[0], r[1]]),
    );
    expect(country["Neon Inc."]).toBe("싱가포르");
    expect(country["Upstash, Inc."]).toBe("싱가포르");
    expect(country["Vercel Inc."]).toBe("미국, 싱가포르");
    /* 나머지는 시안 그대로다 — 전부 싱가포르로 바꾼 것이 아님을 함께 본다 */
    expect(country["Resend, Inc."]).toBe("미국");
  });

  /*
    시안 본문은 「2026. 08. 31.부터 적용되며」인데 이 방침은 9/28부터
    적용된다. 칩과 본문이 다른 날을 가리키면 어느 쪽이 시행일인지 알 수 없다.
  */
  it("제18조 본문의 시행일이 칩과 같은 날이다", () => {
    expect(policy?.effectiveDate).toBe("2026-09-28");

    const closing = policy?.articles.find((a) => a.no === 14)?.blocks[0];
    expect(closing?.kind).toBe("para");
    if (closing?.kind !== "para") return;
    expect(closing.text).toContain("2026. 09. 28.부터 적용되며");
    expect(closing.text).not.toContain("2026. 08. 31.");
  });
});

describe("두 방침의 모양", () => {
  it("전문은 머리행 있는 요약표, 게시본은 행머리 요약표다", () => {
    expect(PRELAUNCH_PRIVACY_POLICY?.summary.kind).toBe("table");
    expect(SEASON1_PRIVACY_POLICY?.summary.kind).toBe("rows");
  });

  /* 묶음 꼭지의 앵커는 대표 번호다 — 목차 링크가 가리키는 자리와 같아야 한다 */
  it("게시본은 8~10과 12~18을 한 꼭지로 묶는다", () => {
    const labels = SEASON1_PRIVACY_POLICY?.articles.map((a) => [
      a.no,
      a.label ?? String(a.no),
    ]);
    expect(labels).toContainEqual([10, "8~10"]);
    expect(labels).toContainEqual([14, "12~18"]);
  });

  it("전문은 18개 조를 그대로 싣는다", () => {
    expect(PRELAUNCH_PRIVACY_POLICY?.articles).toHaveLength(18);
  });
});
