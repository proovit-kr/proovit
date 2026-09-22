import { describe, expect, it } from "vitest";

import { JudgmentResult, StageKey, SubmissionStatus } from "@/generated/prisma/enums";
import {
  S1DraftSchema,
  S1Schema,
  S3Schema,
  currentWeek,
  dDay,
  formatDeadline,
  guideIncomplete,
  paneBadge,
  s3Missing,
  tabTail,
  type StageState,
} from "@/lib/submission";
import { readForm, toForm } from "@/lib/submission-fields";

const KST = (iso: string) => new Date(`${iso}+09:00`);

const state = (over: Partial<StageState>): StageState => ({
  stageKey: StageKey.s1,
  opensAt: KST("2026-10-12T00:00"),
  closesAt: KST("2026-10-18T23:59"),
  status: null,
  judgment: null,
  week: 0,
  ...over,
});

describe("tabTail — 시안 다섯 탭의 꼬리", () => {
  const now = KST("2026-10-26T12:00");
  it("제출됨 · 통과 · 작성 중 · 주간 반복 · 예정", () => {
    expect(tabTail(state({ status: SubmissionStatus.submitted }), now)).toEqual({
      kind: "badge", tone: "gray", label: "제출됨",
    });
    expect(
      tabTail(state({ status: SubmissionStatus.locked, judgment: JudgmentResult.pass }), now),
    ).toEqual({ kind: "badge", tone: "lime", label: "통과" });
    expect(tabTail(state({ status: SubmissionStatus.draft }), now)).toEqual({
      kind: "badge", tone: "warn", label: "작성 중",
    });
    expect(tabTail(state({ stageKey: StageKey.s4 }), now)).toEqual({
      kind: "chip", label: "주간 반복",
    });
    expect(
      tabTail(state({ opensAt: KST("2026-11-09T00:00"), closesAt: null }), now),
    ).toEqual({ kind: "chip", label: "예정" });
  });
  it("열렸는데 아무것도 없으면 꼬리가 없다", () => {
    expect(tabTail(state({}), now)).toBeNull();
  });
});

describe("paneBadge — 머리 배지는 DB 값 그대로", () => {
  const now = KST("2026-10-26T12:00");
  it("submitted · pass · draft · 2주차 작성 중 · 예정", () => {
    expect(paneBadge(state({ status: SubmissionStatus.submitted }), now)?.label).toBe("submitted");
    expect(
      paneBadge(state({ status: SubmissionStatus.locked, judgment: JudgmentResult.pass }), now)?.label,
    ).toBe("pass");
    expect(paneBadge(state({ status: SubmissionStatus.draft }), now)?.label).toBe("draft");
    expect(
      paneBadge(state({ stageKey: StageKey.s4, status: SubmissionStatus.draft, week: 2 }), now)
        ?.label,
    ).toBe("2주차 작성 중");
    expect(paneBadge(state({ opensAt: KST("2026-11-09T00:00") }), now)?.label).toBe("예정");
  });
});

describe("마감 표기", () => {
  it("23:59 마감은 그대로, 자정 마감은 전날 24:00", () => {
    expect(formatDeadline(KST("2026-10-18T23:59"))).toBe("10.18 23:59");
    expect(formatDeadline(KST("2026-11-17T00:00"))).toBe("11.16 24:00");
  });
  it("D-day는 서울 달력으로 센다", () => {
    expect(dDay(KST("2026-10-18T23:59"), KST("2026-10-14T21:00"))).toBe("D-4");
    expect(dDay(KST("2026-11-17T00:00"), KST("2026-11-14T12:00"))).toBe("D-2");
    expect(dDay(KST("2026-10-18T23:59"), KST("2026-10-18T09:00"))).toBe("D-day");
    expect(dDay(KST("2026-10-18T23:59"), KST("2026-10-19T00:00"))).toBeNull();
  });
  it("주차는 시작일부터 7일씩", () => {
    const opens = KST("2026-11-02T00:00");
    expect(currentWeek(opens, KST("2026-11-06T12:00"))).toBe(1);
    expect(currentWeek(opens, KST("2026-11-09T00:00"))).toBe(2);
    expect(currentWeek(null, KST("2026-11-09T00:00"))).toBe(1);
  });
});

describe("s1 스키마 — 필수는 옛 다섯 칸, 나머지는 상한만", () => {
  const empty = readForm(StageKey.s1, new FormData());
  it("임시 저장은 빈 폼도 받는다", () => {
    expect(S1DraftSchema.safeParse(empty).success).toBe(true);
  });
  it("제출은 다섯 칸을 요구한다", () => {
    const result = S1Schema.safeParse(empty);
    expect(result.success).toBe(false);
    const keys = result.success ? [] : result.error.issues.map((i) => String(i.path[0]));
    expect(new Set(keys)).toEqual(
      new Set(["concept", "problemDoc", "coreFeature", "notBuilding", "riskiest"]),
    );
  });
  it("폼 ↔ payload가 왕복한다", () => {
    const fd = new FormData();
    fd.set("concept", "컨셉");
    fd.set("alt0", "유튜브");
    fd.set("alt0pain", "원가 없음");
    fd.set("notBuilding1", "앱");
    fd.set("surveyStranger", "some");
    fd.set("guide2", "on");
    const raw = readForm(StageKey.s1, fd);
    expect(raw.alternatives).toEqual([
      { name: "유튜브", pain: "원가 없음" },
      { name: "", pain: "" },
    ]);
    expect(raw.notBuilding).toEqual(["", "앱"]);
    expect(raw.guideChecks).toEqual([false, false, true]);
    const back = toForm(StageKey.s1, raw);
    expect(back.text.alt0pain).toBe("원가 없음");
    expect(back.text.surveyStranger).toBe("some");
    expect(back.on.guide2).toBe(true);
  });
});

describe("s3 — 스키마가 못 잡는 것", () => {
  const base = {
    serviceUrl: "https://little-potion.proovit.kr",
    builder: "replit",
    signupConnected: true,
    paymentReturnRegistered: false,
    launchChecks: Array.from({ length: 10 }, () => true),
    aiFeature: false,
    aiChecks: Array.from({ length: 5 }, () => false),
    guideChecks: [true, true, true],
  };
  it("시안 네 빌더만 받는다", () => {
    expect(S3Schema.safeParse(base).success).toBe(true);
    expect(S3Schema.safeParse({ ...base, builder: "vercel" }).success).toBe(false);
  });
  it("기타는 이름이, B0이 켜지면 B1~B5가 있어야 한다", () => {
    expect(s3Missing({ ...base, builder: "other" })).toBe("BUILDER_NAME");
    expect(s3Missing({ ...base, launchChecks: [true] })).toBe("LAUNCH_INCOMPLETE");
    expect(s3Missing({ ...base, aiFeature: true })).toBe("AI_INCOMPLETE");
    expect(s3Missing(base)).toBeNull();
  });
  it("가이드 체크는 전부 켜야 한다", () => {
    expect(guideIncomplete([true, true, false], 3)).toBe(true);
    expect(guideIncomplete([true, true, true], 3)).toBe(false);
  });
});
