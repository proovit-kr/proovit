import { describe, expect, it } from "vitest";

import { notiHref, notiTone } from "../notifications-view";

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
