import { describe, expect, it } from "vitest";

import { maskEmail } from "@/lib/admin";

describe("maskEmail — 시안 리드 표 「y***@g***.com」", () => {
  it("앞 한 글자·도메인 첫 글자·최상위 도메인만 남긴다", () => {
    expect(maskEmail("yeonwoo@gmail.com")).toBe("y***@g***.com");
    expect(maskEmail("jae@daum.net")).toBe("j***@d***.net");
  });
  it("하위 도메인이 있어도 마지막 점 뒤만 남긴다", () => {
    expect(maskEmail("a@mail.example.co")).toBe("a***@m***.co");
  });
  it("모양이 이상하면 통째로 가린다", () => {
    expect(maskEmail("no-at-sign")).toBe("***");
    expect(maskEmail("@x.com")).toBe("***");
  });
});
