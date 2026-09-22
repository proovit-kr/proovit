import { describe, expect, it } from "vitest";

import {
  formatInviteCode,
  InviteCodeSchema,
  normalizeInviteCode,
} from "@/lib/team";

/*
  초대 코드 — 시안 `PRV-KP-7F3K` 모양. 저장은 하이픈 없이, 표시는 3-2-4.
  ⚠️ 시안 예시의 L은 우리 문자표에 없다(1/I/L 혼동 방지). 예시는 KP로 쓴다.
*/
describe("초대 코드 형식", () => {
  it("저장된 코드를 PRV-XX-XXXX로 보여준다", () => {
    expect(formatInviteCode("PRVKP7F3K")).toBe("PRV-KP-7F3K");
  });

  it("사람이 어떻게 넣어도 같은 코드로 읽는다", () => {
    expect(normalizeInviteCode(" prv-kp-7f3k ")).toBe("PRVKP7F3K");
    expect(normalizeInviteCode("PRV KP 7F3K")).toBe("PRVKP7F3K");
    /* 접두사를 빼고 넣어도 받는다 */
    expect(normalizeInviteCode("kp-7f3k")).toBe("PRVKP7F3K");
  });

  it("형식이 아니면 거절한다", () => {
    expect(InviteCodeSchema.safeParse("PRV-KP-7F3K").success).toBe(true);
    expect(InviteCodeSchema.safeParse("KP-7F3K").success).toBe(true);
    /* 옛 8자 코드, 헷갈리는 글자(0·O·1·I·L·8·B) */
    expect(InviteCodeSchema.safeParse("MKVH4AHQ").success).toBe(false);
    expect(InviteCodeSchema.safeParse("PRV-L0-7F3K").success).toBe(false);
    expect(InviteCodeSchema.safeParse("").success).toBe(false);
  });
});
