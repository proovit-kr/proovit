import { describe, expect, it } from "vitest";

import { notiHref, notiState, notiTime, notiTone } from "../notifications-view";

describe("notiTone", () => {
  it("심사·제출·소명은 judge, 마감은 due, 나머지는 info", () => {
    expect(notiTone("gate_result")).toBe("judge");
    expect(notiTone("appeal")).toBe("judge");
    expect(notiTone("deadline")).toBe("due");
    expect(notiTone("notice")).toBe("info");
    expect(notiTone("무엇이든")).toBe("info");
  });
});

describe("notiHref", () => {
  it("우리 경로만 받는다", () => {
    expect(notiHref("/dashboard/submit/s3")).toBe("/dashboard/submit/s3");
    expect(notiHref(null)).toBeNull();
    expect(notiHref("https://evil.example")).toBeNull();
    expect(notiHref("//evil.example")).toBeNull();
    expect(notiHref("/\\evil.example")).toBeNull();
  });
});

describe("notiTime", () => {
  const now = new Date("2026-10-23T03:00:00Z"); // KST 10.23 12:00
  it("한 시간 안이면 방금, 그 밖은 날짜", () => {
    expect(notiTime(new Date("2026-10-23T02:01:00Z"), now)).toBe("방금");
    expect(notiTime(new Date("2026-10-23T02:00:00Z"), now)).toBe("10.23");
    expect(notiTime(new Date("2026-10-12T01:00:00Z"), now)).toBe("10.12");
  });
});

describe("notiState", () => {
  it("환영 알림뿐이면 빈 상태", () => {
    expect(notiState(["welcome"])).toBe("empty");
    expect(notiState([])).toBe("empty");
    expect(notiState(["welcome", "deadline"])).toBe("list");
  });
});
