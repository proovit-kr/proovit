import { describe, expect, it } from "vitest";

import {
  OriginUrlSchema,
  isPublicHost,
  measurementState,
  originResponded,
} from "@/lib/measurement";

/*
  측정 연동 화면의 세 판(시안 ①②③)은 hostname 행 두 칸을 접은 것이다.
  화면·개발 바·대조 스크립트가 이 하나를 같이 쓰므로 표가 먼저다.
*/
describe("측정 연동 판 판정", () => {
  const at = new Date("2026-10-01T00:00:00Z");

  it("검증 시각이 있는 active만 ②다", () => {
    expect(measurementState({ deployStatus: "active", verifiedAt: at })).toBe("ok");
    expect(measurementState({ deployStatus: "active", verifiedAt: null })).toBe("wait");
  });

  it("마지막 확인이 실패면 ③이다", () => {
    expect(measurementState({ deployStatus: "failed", verifiedAt: null })).toBe("fail");
  });

  it("그 밖은 전부 ① 대기다", () => {
    expect(measurementState({ deployStatus: "pending", verifiedAt: null })).toBe("wait");
    expect(measurementState({ deployStatus: "verifying", verifiedAt: null })).toBe("wait");
    expect(measurementState({ deployStatus: "disabled", verifiedAt: at })).toBe("wait");
  });
});

describe("배포 주소 응답 판정", () => {
  it("2xx·3xx만 응답으로 친다", () => {
    expect(originResponded(200)).toBe(true);
    expect(originResponded(304)).toBe(true);
    expect(originResponded(404)).toBe(false);
    expect(originResponded(503)).toBe(false);
  });
});

describe("배포 주소의 호스트", () => {
  it("공개 도메인만 받는다", () => {
    expect(isPublicHost("little-potion.lovable.app")).toBe(true);
    expect(isPublicHost("localhost")).toBe(false);
    expect(isPublicHost("app.localhost")).toBe(false);
    expect(isPublicHost("10.0.0.1")).toBe(false);
    expect(isPublicHost("[::1]")).toBe(false);
    expect(isPublicHost("intranet")).toBe(false);
  });

  it("스키마가 IP·localhost를 거른다 — 서버가 그 주소를 직접 부른다", () => {
    expect(OriginUrlSchema.safeParse("https://127.0.0.1/").success).toBe(false);
    expect(OriginUrlSchema.safeParse("https://localhost:3000").success).toBe(false);
    expect(OriginUrlSchema.safeParse("https://little-potion.lovable.app").success).toBe(true);
  });

  it("팀 주소 자신은 배포 주소가 될 수 없다 — 워커가 제자리를 돈다", () => {
    expect(OriginUrlSchema.safeParse("https://little-potion.proovit.kr").success).toBe(false);
    expect(OriginUrlSchema.safeParse("https://proovit.kr").success).toBe(false);
  });
});
