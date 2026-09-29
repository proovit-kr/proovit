import { describe, expect, it } from "vitest";

import { checkNewEmail, cleanCode, codeHash, newCode } from "@/lib/email-change";

describe("이메일 변경 규칙", () => {
  it("형식·같은 주소를 거른다 — 대소문자와 공백은 같은 주소다", () => {
    expect(checkNewEmail("abc", "a@proovit.kr")).toBe("INVALID");
    expect(checkNewEmail(" A@Proovit.kr ", "a@proovit.kr")).toBe("SAME");
    expect(checkNewEmail("b@proovit.kr", "a@proovit.kr")).toBeNull();
  });

  it("코드는 여섯 자리, 사람이 친 공백·하이픈은 뗀다", () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^\d{6}$/);
    expect(cleanCode("123 456")).toBe("123456");
    expect(cleanCode("123-456")).toBe("123456");
  });

  it("해시는 사용자마다 다르다 — token 열이 표 전체에서 unique다", () => {
    expect(codeHash("u1", "123456")).not.toBe(codeHash("u2", "123456"));
  });
});
