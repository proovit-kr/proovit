import { describe, expect, it } from "vitest";

import {
  EntryStage,
  EntryStatus,
  JudgmentResult,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { gateOf, passedGate, stageReachable } from "@/lib/access-policy";
import { deadlineParts, formatDeadline } from "@/lib/kst-format";
import {
  S1DraftSchema,
  S1Schema,
  S3Schema,
  currentWeek,
  dDay,
  finalAutoSubmitTarget,
  gateMissTarget,
  guideIncomplete,
  paneBadge,
  participantStages,
  s3Missing,
  stageRowState,
  stageWindows,
  tabTail,
  visitRange,
  weekDue,
  windowStarted,
  type StageState,
} from "@/lib/submission";
import { readForm, toForm } from "@/lib/submission-fields";

const KST = (iso: string) => new Date(`${iso}+09:00`);

const state = (over: Partial<StageState>): StageState => ({
  stageKey: StageKey.s1,
  opensAt: KST("2026-10-12T00:00"),
  closesAt: KST("2026-10-18T23:59"),
  open: true,
  status: null,
  judgment: null,
  week: 0,
  ...over,
});

describe("tabTail — 시안 다섯 탭의 꼬리", () => {
  it("제출됨 · 통과 · 작성 중 · 주간 반복 · 예정", () => {
    expect(tabTail(state({ status: SubmissionStatus.submitted }))).toEqual({
      kind: "badge", tone: "gray", label: "제출됨",
    });
    expect(
      tabTail(state({ status: SubmissionStatus.locked, judgment: JudgmentResult.pass })),
    ).toEqual({ kind: "badge", tone: "lime", label: "통과" });
    expect(tabTail(state({ status: SubmissionStatus.draft }))).toEqual({
      kind: "badge", tone: "warn", label: "작성 중",
    });
    expect(tabTail(state({ stageKey: StageKey.s4 }))).toEqual({
      kind: "chip", label: "주간 반복",
    });
    expect(tabTail(state({ open: false }))).toEqual({ kind: "chip", label: "예정" });
  });
  it("열렸는데 아무것도 없으면 꼬리가 없다", () => {
    expect(tabTail(state({}))).toBeNull();
  });
  /*
    유동 게이트(2026-09-25) — 「예정」은 달력이 아니라 open(실제 창 + 진도)이 정한다.
    달력 시작일이 한참 뒤여도 진도로 닿았으면 꼬리가 없고, 달력이 지났어도
    진도로 못 닿았으면 「예정」이다.
  */
  it("예정은 달력이 아니라 open으로 가른다", () => {
    expect(tabTail(state({ opensAt: KST("2026-11-09T00:00"), open: true }))).toBeNull();
    expect(tabTail(state({ opensAt: KST("2026-09-28T00:00"), open: false }))).toEqual({
      kind: "chip", label: "예정",
    });
    /* 이미 낸 것은 open과 무관하게 제출 상태가 먼저다 */
    expect(tabTail(state({ status: SubmissionStatus.submitted, open: false }))?.kind).toBe("badge");
  });
});

describe("paneBadge — 머리 배지는 DB 값 그대로", () => {
  it("submitted · pass · draft · 2주차 작성 중 · 예정", () => {
    expect(paneBadge(state({ status: SubmissionStatus.submitted }))?.label).toBe("submitted");
    expect(
      paneBadge(state({ status: SubmissionStatus.locked, judgment: JudgmentResult.pass }))?.label,
    ).toBe("pass");
    expect(paneBadge(state({ status: SubmissionStatus.draft }))?.label).toBe("draft");
    expect(
      paneBadge(state({ stageKey: StageKey.s4, status: SubmissionStatus.draft, week: 2 }))
        ?.label,
    ).toBe("2주차 작성 중");
    expect(paneBadge(state({ open: false }))?.label).toBe("예정");
  });
  it("예정은 달력이 아니라 open으로 가른다", () => {
    expect(paneBadge(state({ opensAt: KST("2026-11-09T00:00"), open: true }))).toBeNull();
    expect(paneBadge(state({ opensAt: KST("2026-09-28T00:00"), open: false }))?.label).toBe("예정");
  });
});

// ── 유동 게이트 — 실제 창 ─────────────────────────────────────
/* 개발 일정(dev-sandbox·헤더 시안과 같은 5주) */
const DEV_STAGES = [
  { stageKey: StageKey.s1, isGate: false, opensAt: KST("2026-09-28T00:00"), closesAt: KST("2026-10-04T23:59") },
  { stageKey: StageKey.s2, isGate: true, opensAt: KST("2026-10-05T00:00"), closesAt: KST("2026-10-11T23:59") },
  { stageKey: StageKey.s3, isGate: false, opensAt: KST("2026-10-12T00:00"), closesAt: KST("2026-10-18T23:59") },
  { stageKey: StageKey.s4, isGate: false, opensAt: KST("2026-10-19T00:00"), closesAt: KST("2026-10-25T23:59") },
  { stageKey: StageKey.s5, isGate: true, opensAt: KST("2026-10-26T00:00"), closesAt: KST("2026-11-02T00:00") },
];

describe("stageWindows — 유동 게이트(2026-09-25 수연 지시)", () => {
  const w = stageWindows(DEV_STAGES);

  it("여는 시각 — 첫(개막)·마지막만 달력, 가운데는 진도가 연다(null)", () => {
    expect(w.s1?.opensAt).toEqual(KST("2026-09-28T00:00"));
    expect(w.s2?.opensAt).toBeNull();
    expect(w.s3?.opensAt).toBeNull();
    expect(w.s4?.opensAt).toBeNull();
    expect(w.s5?.opensAt).toEqual(KST("2026-10-26T00:00"));
  });

  it("닫는 시각 — 게이트는 자기 마감, 아니면 뒤 첫 게이트의 마감", () => {
    expect(w.s1?.closesAt).toEqual(KST("2026-10-11T23:59"));
    expect(w.s2?.closesAt).toEqual(KST("2026-10-11T23:59"));
    expect(w.s3?.closesAt).toEqual(KST("2026-11-02T00:00"));
    expect(w.s4?.closesAt).toEqual(KST("2026-11-02T00:00"));
    expect(w.s5?.closesAt).toEqual(KST("2026-11-02T00:00"));
  });

  it("입력 순서와 무관하다", () => {
    expect(stageWindows([...DEV_STAGES].reverse())).toEqual(w);
  });

  it("뒤에 게이트가 없으면 자기 마감", () => {
    const noGate = DEV_STAGES.map((s) => ({ ...s, isGate: false }));
    const x = stageWindows(noGate);
    expect(x.s1?.closesAt).toEqual(KST("2026-10-04T23:59"));
    expect(x.s3?.closesAt).toEqual(KST("2026-10-18T23:59"));
  });

  it("일정이 비어 있으면(시즌1 잠정) 창도 비어 있다", () => {
    const blank = DEV_STAGES.map((s) => ({ ...s, opensAt: null, closesAt: null }));
    expect(
      Object.values(stageWindows(blank)).map((x) => [x?.opensAt, x?.closesAt]),
    ).toEqual(Array.from({ length: 5 }, () => [null, null]));
  });

  it("창을 닫는 게이트 — 게이트는 자기, 아니면 뒤 첫 게이트", () => {
    expect([w.s1?.gate, w.s2?.gate, w.s3?.gate, w.s4?.gate, w.s5?.gate]).toEqual([
      StageKey.s2, StageKey.s2, StageKey.s5, StageKey.s5, StageKey.s5,
    ]);
    const noGate = stageWindows(DEV_STAGES.map((s) => ({ ...s, isGate: false })));
    expect(noGate.s1?.gate).toBeNull();
  });

  it("s1을 달력 마감(10.04) 뒤에 내려는 팀도 1차 마감 전이면 열려 있다", () => {
    const now = KST("2026-10-08T12:00");
    expect(windowStarted(w.s1!, now)).toBe(true);
    expect(w.s1!.closesAt!.getTime() > now.getTime()).toBe(true);
  });

  it("s1을 일찍 낸 팀 — s2는 달력 주차(10.05) 전에도 시작된 창이다", () => {
    expect(windowStarted(w.s2!, KST("2026-09-29T10:00"))).toBe(true);
  });

  it("개막 전에는 s1이, s5 달력 전에는 s5가 시작 전이다", () => {
    expect(windowStarted(w.s1!, KST("2026-09-27T23:00"))).toBe(false);
    expect(windowStarted(w.s5!, KST("2026-10-25T23:00"))).toBe(false);
    expect(windowStarted(w.s5!, KST("2026-10-26T00:00"))).toBe(true);
  });
});

// ── 제출 판 한 행 — 실제 창 + 진도 + 제출 상태 ──────────────────
/*
  submission-store가 재료를 읽는 방식 그대로 조립해 개발 일정 5주 × 진도로 돌린다.
  「예정」(open=false)과 잠금 사유가 어느 주·어느 진도에서 무엇이 되는지를 고정한다.
*/
type Sub = { status: SubmissionStatus; revisionDueAt?: Date };
type Row = ReturnType<typeof stageRowState>;

function rows(
  now: Date,
  entryStage: EntryStage,
  subs: Partial<Record<StageKey, Sub>> = {},
): Record<StageKey, Row> {
  const w = stageWindows(DEV_STAGES);
  const out = {} as Record<StageKey, Row>;
  for (const s of DEV_STAGES) {
    const win = w[s.stageKey]!;
    const cover = win.gate !== null && win.gate !== s.stageKey ? win.gate : null;
    const sub = subs[s.stageKey];
    out[s.stageKey] = stageRowState({
      win,
      now,
      current: sub ? { status: sub.status, revisionDueAt: sub.revisionDueAt ?? null } : null,
      reachable: stageReachable(s.stageKey as unknown as EntryStage, entryStage),
      gateSettled:
        cover !== null &&
        (subs[cover]?.status === SubmissionStatus.locked ||
          passedGate(entryStage, cover as unknown as EntryStage)),
      prevSubmitted: (() => {
        const prev = DEV_STAGES[DEV_STAGES.indexOf(s) - 1];
        if (!prev || prev.isGate) return true;
        const sub = subs[prev.stageKey];
        return sub !== undefined && sub.status !== SubmissionStatus.draft;
      })(),
    });
  }
  return out;
}

/** 열린 판(「예정」 아님). 잠금 사유가 있으면 같이 */
const on = (lockedReason: Row["lockedReason"] = null): Row => ({ open: true, lockedReason });
/** 「예정」 판 */
const later = (lockedReason: Row["lockedReason"] = null): Row => ({ open: false, lockedReason });

const SUBMITTED = { status: SubmissionStatus.submitted };
const LOCKED = { status: SubmissionStatus.locked };

describe("stageRowState — 유동 게이트의 판 한 행", () => {
  it("개막 전 — 달력이 여는 s1·s5는 안 열림, 가운데는 진도가 막아 예정", () => {
    const r = rows(KST("2026-09-27T12:00"), EntryStage.applied);
    expect(r.s1).toEqual(later("STAGE_NOT_OPEN"));
    expect([r.s2, r.s3, r.s4]).toEqual([later(), later(), later()]);
    expect(r.s5).toEqual(later("STAGE_NOT_OPEN"));
  });

  it("s1을 내면 s2가 바로 열린다 — 달력 주차(10.05)를 기다리지 않는다", () => {
    const before = rows(KST("2026-09-30T12:00"), EntryStage.applied);
    expect([before.s1, before.s2]).toEqual([on(), later()]);
    const after = rows(KST("2026-09-30T12:00"), EntryStage.s1, { s1: SUBMITTED });
    expect([after.s1, after.s2, after.s3]).toEqual([on(), on(), later()]);
  });

  it("s1은 달력 마감(10.04) 뒤에도 1차 마감(10.11) 전이면 열려 있다", () => {
    expect(rows(KST("2026-10-08T12:00"), EntryStage.applied).s1).toEqual(on());
  });

  it("1차 심사 대기 — 판정 전까지는 s1·s2를 고칠 수 있고 s3은 예정", () => {
    const r = rows(KST("2026-10-08T12:00"), EntryStage.s2, { s1: SUBMITTED, s2: SUBMITTED });
    expect([r.s1, r.s2, r.s3, r.s4]).toEqual([on(), on(), later(), later()]);
  });

  it("마감 전에 1차 판정이 나면 s1도 그때 잠긴다 — 판정 근거를 뒤에 못 고친다", () => {
    const r = rows(KST("2026-10-08T12:00"), EntryStage.s3, { s1: SUBMITTED, s2: LOCKED });
    expect(r.s1).toEqual(on("STAGE_LOCKED"));
    expect(r.s2).toEqual(on("STAGE_LOCKED"));
    /* 통과하면 s3이 열린다. s4는 s3을 내야 열리고, s5는 달력이라 예정 */
    expect([r.s3, r.s4, r.s5]).toEqual([
      on(), later("STAGE_NOT_OPEN"), later("STAGE_NOT_OPEN"),
    ]);
  });

  it("1차를 통과해도 s3을 내기 전에는 s4가 안 열린다 — 내면 바로 열린다", () => {
    /* 진도는 통과 때도 s3, s3을 낸 뒤에도 s3이다 — 제출 행이 가른다 */
    const now = KST("2026-10-14T12:00");
    const passed = { s1: SUBMITTED, s2: LOCKED };
    expect(rows(now, EntryStage.s3, passed).s4).toEqual(later("STAGE_NOT_OPEN"));
    expect(
      rows(now, EntryStage.s3, { ...passed, s3: { status: SubmissionStatus.draft } }).s4,
    ).toEqual(later("STAGE_NOT_OPEN"));
    expect(rows(now, EntryStage.s3, { ...passed, s3: SUBMITTED }).s4).toEqual(on());
  });

  it("게이트 제출이 잠겼거나 진도가 게이트를 넘었으면 어느 쪽이든 잠근다", () => {
    const now = KST("2026-10-08T12:00");
    expect(rows(now, EntryStage.s2, { s2: LOCKED }).s1).toEqual(on("STAGE_LOCKED"));
    expect(rows(now, EntryStage.s3, { s2: SUBMITTED }).s1).toEqual(on("STAGE_LOCKED"));
  });

  it("1차 마감 뒤에는 「마감」이 판정 잠금보다 먼저다(버튼 「마감됨」)", () => {
    const r = rows(KST("2026-10-15T12:00"), EntryStage.s3, { s1: SUBMITTED, s2: LOCKED });
    expect([r.s1, r.s2, r.s3]).toEqual([on("STAGE_CLOSED"), on("STAGE_LOCKED"), on()]);
  });

  it("마감이 지났는데 진도로 못 닿은 판은 예정이 아니다 — 탭 꼬리도 안 단다", () => {
    const r = rows(KST("2026-10-13T12:00"), EntryStage.applied);
    expect([r.s1, r.s2]).toEqual([on("STAGE_CLOSED"), on("STAGE_CLOSED")]);
    expect(tabTail(state({ stageKey: StageKey.s2, open: r.s2.open }))).toBeNull();
    expect(paneBadge(state({ stageKey: StageKey.s2, open: r.s2.open }))).toBeNull();
    /* 아직 마감 전인 s3은 여전히 예정이다 */
    expect(r.s3).toEqual(later());
    expect(tabTail(state({ stageKey: StageKey.s3, open: r.s3.open }))).toEqual({
      kind: "chip", label: "예정",
    });
  });

  it("보완 기한이 남아 있으면 마감 뒤에도 연다", () => {
    const r = rows(KST("2026-10-13T12:00"), EntryStage.s2, {
      s1: SUBMITTED,
      s2: { status: SubmissionStatus.submitted, revisionDueAt: KST("2026-10-14T12:00") },
    });
    expect([r.s1, r.s2]).toEqual([on("STAGE_CLOSED"), on()]);
  });

  it("s5는 달력으로 열린다 — s4 팀도 10.26 전에는 예정", () => {
    const done = { s1: SUBMITTED, s2: LOCKED, s3: SUBMITTED, s4: SUBMITTED };
    const early = rows(KST("2026-10-20T12:00"), EntryStage.s4, done);
    expect([early.s3, early.s4, early.s5]).toEqual([on(), on(), later("STAGE_NOT_OPEN")]);
    expect(rows(KST("2026-10-27T12:00"), EntryStage.s4, done).s5).toEqual(on());
  });

  it("2차 판정이 나면 s3·s4도 잠기고, 마감 뒤에는 마감이다", () => {
    const all = { s1: SUBMITTED, s2: LOCKED, s3: SUBMITTED, s4: SUBMITTED, s5: LOCKED };
    const judged = rows(KST("2026-11-01T12:00"), EntryStage.completed, all);
    expect([judged.s3, judged.s4, judged.s5]).toEqual([
      on("STAGE_LOCKED"), on("STAGE_LOCKED"), on("STAGE_LOCKED"),
    ]);
    const over = rows(KST("2026-11-03T12:00"), EntryStage.completed, all);
    expect([over.s3, over.s4, over.s5]).toEqual([
      on("STAGE_CLOSED"), on("STAGE_CLOSED"), on("STAGE_LOCKED"),
    ]);
  });
});

describe("participantStages — 참가자 헤더가 보는 일정", () => {
  const cal = DEV_STAGES.map((s) => ({
    key: s.stageKey,
    name: s.stageKey,
    isGate: s.isGate,
    opensAt: s.opensAt,
    closesAt: s.closesAt,
  }));
  const at = (now: Date, key: StageKey) =>
    participantStages(cal, now).find((s) => s.key === key)!;

  it("여는 시각은 실제 창, 마감은 덮는 게이트의 마감", () => {
    const now = KST("2026-10-14T10:00");
    expect(at(now, StageKey.s1)).toMatchObject({
      opensAt: KST("2026-09-28T00:00"),
      closesAt: KST("2026-10-11T23:59"),
    });
    expect(at(now, StageKey.s3)).toMatchObject({ opensAt: null, closesAt: KST("2026-11-02T00:00") });
    expect(at(now, StageKey.s5)).toMatchObject({
      opensAt: KST("2026-10-26T00:00"),
      closesAt: KST("2026-11-02T00:00"),
    });
  });

  it("s4는 그 주차의 끝이 마감이다", () => {
    expect(at(KST("2026-10-20T10:00"), StageKey.s4).closesAt).toEqual(KST("2026-10-25T23:59"));
    /* 달력보다 먼저 닿아도 1주차로 센다 */
    expect(at(KST("2026-10-13T10:00"), StageKey.s4).closesAt).toEqual(KST("2026-10-25T23:59"));
  });

  it("다른 칸(이름)은 그대로 둔다", () => {
    expect(at(KST("2026-10-14T10:00"), StageKey.s2).name).toBe("s2");
  });
});

describe("weekDue — s4 「이번 주 마감」", () => {
  const opens = KST("2026-10-19T00:00");
  const closes = KST("2026-11-02T00:00");
  it("주차 끝, 실제 마감을 넘지 않게", () => {
    expect(weekDue(opens, 1, closes)).toEqual(KST("2026-10-25T23:59"));
    expect(weekDue(opens, 2, closes)).toEqual(KST("2026-11-01T23:59"));
    expect(weekDue(opens, 3, closes)).toEqual(closes);
  });
  it("달력이 비면 실제 마감, 마감이 비면 주차 끝", () => {
    expect(weekDue(null, 1, closes)).toEqual(closes);
    expect(weekDue(opens, 1, null)).toEqual(KST("2026-10-25T23:59"));
  });
});

describe("visitRange — s2 「10.05~10.10 유효 방문」", () => {
  const closes = KST("2026-10-11T23:59");
  /* metric_date는 서울 날짜의 UTC 0시다(measure.ts seoulDateOnly) */
  const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
  it("첫 집계일 ~ 오늘(시안: 10.10 제출 판)", () => {
    expect(visitRange(day("2026-10-05"), closes, KST("2026-10-10T18:40"))).toBe("10.05~10.10");
  });
  it("s2 달력 전에 올린 랜딩의 방문부터 센다", () => {
    expect(visitRange(day("2026-09-30"), closes, KST("2026-10-03T09:00"))).toBe("09.30~10.03");
  });
  it("마감이 지나면 마감일에서 멈춘다", () => {
    expect(visitRange(day("2026-10-05"), closes, KST("2026-10-14T09:00"))).toBe("10.05~10.11");
    expect(visitRange(day("2026-10-05"), KST("2026-10-12T00:00"), KST("2026-10-14T09:00"))).toBe(
      "10.05~10.11",
    );
  });
  it("집계가 없으면 비운다", () => {
    expect(visitRange(null, closes, KST("2026-10-10T18:40"))).toBe("");
  });
  it("시계가 첫 집계일보다 앞서도 거꾸로 적지 않는다(개발 시계)", () => {
    expect(visitRange(day("2026-10-11"), closes, KST("2026-10-08T12:00"))).toBe("10.11~10.11");
  });
});

describe("마감 표기", () => {
  it("23:59 마감은 그대로, 자정 마감은 전날 24:00", () => {
    expect(formatDeadline(KST("2026-10-18T23:59"))).toBe("10.18 23:59");
    expect(formatDeadline(KST("2026-11-17T00:00"))).toBe("11.16 24:00");
  });
  /* 메일(「2026년 10월 18일 24:00」)이 같은 규칙을 쓰도록 조각으로 준다 — 해가 바뀌어도 전날이다 */
  it("마감 조각도 자정이면 전날 24:00이다", () => {
    expect(deadlineParts(KST("2026-10-19T00:00"))).toEqual({
      year: "2026",
      month: "10",
      day: "18",
      time: "24:00",
    });
    expect(deadlineParts(KST("2027-01-01T00:00"))).toEqual({
      year: "2026",
      month: "12",
      day: "31",
      time: "24:00",
    });
    expect(deadlineParts(KST("2026-10-18T23:59"))).toEqual({
      year: "2026",
      month: "10",
      day: "18",
      time: "23:59",
    });
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

describe("finalAutoSubmitTarget — s5 자동 제출 대상(FR-H6)", () => {
  const closes = KST("2026-11-01T23:59");
  const team = (over: Partial<Parameters<typeof finalAutoSubmitTarget>[0]> = {}) => ({
    status: EntryStatus.active,
    stage: EntryStage.s4,
    raceStartedAt: KST("2026-10-14T10:00"),
    ...over,
  });

  it("레이스 중인 팀이 버튼을 안 눌렀으면 대상이다", () => {
    expect(finalAutoSubmitTarget(team(), closes)).toBe(true);
  });

  it("s3만 내고 주간 제출이 없어도 대상이다 — 지표는 플랫폼이 센다", () => {
    expect(finalAutoSubmitTarget(team({ stage: EntryStage.s3 }), closes)).toBe(true);
  });

  it("배포하지 않은 팀(s3 미제출)은 아니다 — 게이트 미제출이다", () => {
    expect(finalAutoSubmitTarget(team({ stage: EntryStage.s3, raceStartedAt: null }), closes)).toBe(false);
  });

  it("레이스 시작이 마감 뒤면(개발 시계) 아니다", () => {
    expect(finalAutoSubmitTarget(team({ raceStartedAt: KST("2026-11-02T09:00") }), closes)).toBe(false);
  });

  it("이미 냈거나 심사가 끝난 팀은 아니다", () => {
    expect(finalAutoSubmitTarget(team({ stage: EntryStage.s5 }), closes)).toBe(false);
    expect(finalAutoSubmitTarget(team({ stage: EntryStage.completed }), closes)).toBe(false);
  });

  it("실격·자진 포기·탈락 팀은 아니다", () => {
    for (const status of [EntryStatus.disqualified, EntryStatus.withdrawn, EntryStatus.eliminated]) {
      expect(finalAutoSubmitTarget(team({ status }), closes)).toBe(false);
    }
  });
});

describe("gateMissTarget — 게이트 미제출 탈락(PLN7 1-3)", () => {
  const closes = KST("2026-11-01T23:59");
  const team = (over: Partial<Parameters<typeof gateMissTarget>[1]> = {}) => ({
    status: EntryStatus.active,
    stage: EntryStage.s1,
    raceStartedAt: null,
    ...over,
  });

  it("s2 — s1까지 냈거나 아무것도 안 낸 팀", () => {
    expect(gateMissTarget(StageKey.s2, team(), closes)).toBe(true);
    expect(gateMissTarget(StageKey.s2, team({ stage: EntryStage.applied }), closes)).toBe(true);
  });

  it("s2 — 냈으면(진도 s2) 판정을 기다린다", () => {
    expect(gateMissTarget(StageKey.s2, team({ stage: EntryStage.s2 }), closes)).toBe(false);
  });

  it("s5 — 배포하지 않은 팀(레이스 전)", () => {
    expect(gateMissTarget(StageKey.s5, team({ stage: EntryStage.s3 }), closes)).toBe(true);
  });

  it("s5 — 레이스를 시작한 팀은 자동 제출 대상이라 아니다", () => {
    const racing = team({ stage: EntryStage.s4, raceStartedAt: KST("2026-10-14T10:00") });
    expect(gateMissTarget(StageKey.s5, racing, closes)).toBe(false);
    expect(finalAutoSubmitTarget(racing, closes)).toBe(true);
  });

  it("s5 — 1차 판정을 기다리는 팀(진도 s2)은 운영자의 몫이다", () => {
    expect(gateMissTarget(StageKey.s5, team({ stage: EntryStage.s2 }), closes)).toBe(false);
  });

  it("이미 탈락·실격·포기면 아니다", () => {
    for (const status of [EntryStatus.eliminated, EntryStatus.disqualified, EntryStatus.withdrawn]) {
      expect(gateMissTarget(StageKey.s2, team({ status }), closes)).toBe(false);
    }
  });

  it("게이트가 아닌 스테이지는 아니다", () => {
    expect(gateMissTarget(StageKey.s3, team({ stage: EntryStage.s2 }), closes)).toBe(false);
  });
});

describe("gateOf — 탈락한 팀이 떨어진 게이트", () => {
  it("s2 이하는 1차 — 냈으면 s2, 안 냈으면 applied·s1", () => {
    for (const stage of [EntryStage.applied, EntryStage.s1, EntryStage.s2]) {
      expect(gateOf(stage)).toBe(StageKey.s2);
    }
  });

  it("s3 이상은 2차 — 배포 전(s3)에 s5 마감을 넘긴 팀도", () => {
    for (const stage of [EntryStage.s3, EntryStage.s4, EntryStage.s5]) {
      expect(gateOf(stage)).toBe(StageKey.s5);
    }
  });
});
