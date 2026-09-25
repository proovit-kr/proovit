import { describe, expect, it } from "vitest";

import { SeasonPhase } from "@/generated/prisma/enums";
import { kstInputValue, parseKstInput } from "@/lib/admin";
import { phaseScheduleError, planPhaseSchedule, planPhaseTransitions } from "@/lib/season-phase";

const KST = (s: string) => new Date(`${s}+09:00`);
const row = (id: string, phase: SeasonPhase, at: string) => ({ id, phase, startsAt: KST(at) });

describe("planPhaseTransitions — 페이즈 크론의 계획(뒤로는 안 간다)", () => {
  it("예정 시각이 지난 다음 페이즈로 전진한다", () => {
    const plan = planPhaseTransitions(SeasonPhase.pre_apply, [
      row("r", SeasonPhase.recruiting, "2026-10-14T00:00:00"),
    ]);
    expect(plan.steps).toEqual([
      expect.objectContaining({ kind: "apply", from: SeasonPhase.pre_apply, to: SeasonPhase.recruiting }),
    ]);
    expect(plan.final).toBe(SeasonPhase.recruiting);
  });

  it("draft에서 사전 신청으로 연다", () => {
    const plan = planPhaseTransitions(SeasonPhase.draft, [
      row("p", SeasonPhase.pre_apply, "2026-10-01T00:00:00"),
    ]);
    expect(plan.steps[0]).toMatchObject({ kind: "apply", from: SeasonPhase.draft, to: SeasonPhase.pre_apply });
    expect(plan.final).toBe(SeasonPhase.pre_apply);
  });

  it("이미 지난 페이즈는 건너뛴다 — 수동으로 앞당긴 뒤다", () => {
    const plan = planPhaseTransitions(SeasonPhase.racing, [
      row("r", SeasonPhase.recruiting, "2026-10-14T00:00:00"),
    ]);
    expect(plan.steps).toEqual([expect.objectContaining({ kind: "skip" })]);
    expect(plan.final).toBe(SeasonPhase.racing);
  });

  it("같은 페이즈도 건너뛴다", () => {
    const plan = planPhaseTransitions(SeasonPhase.recruiting, [
      row("r", SeasonPhase.recruiting, "2026-10-14T00:00:00"),
    ]);
    expect(plan.steps.map((s) => s.kind)).toEqual(["skip"]);
    expect(plan.final).toBe(SeasonPhase.recruiting);
  });

  it("여러 행이 밀려 있으면 시각 순으로 차례로 전진하고 마지막이 최종이다", () => {
    const plan = planPhaseTransitions(SeasonPhase.pre_apply, [
      /* 입력 순서가 뒤섞여도 시각 순으로 본다 */
      row("race", SeasonPhase.racing, "2026-10-28T00:00:00"),
      row("rec", SeasonPhase.recruiting, "2026-10-14T00:00:00"),
    ]);
    expect(plan.steps).toEqual([
      expect.objectContaining({ kind: "apply", from: SeasonPhase.pre_apply, to: SeasonPhase.recruiting }),
      expect.objectContaining({ kind: "apply", from: SeasonPhase.recruiting, to: SeasonPhase.racing }),
    ]);
    expect(plan.final).toBe(SeasonPhase.racing);
  });

  it("지난 것은 건너뛰고 앞선 것만 전진한다", () => {
    const plan = planPhaseTransitions(SeasonPhase.recruiting, [
      row("pre", SeasonPhase.pre_apply, "2026-10-01T00:00:00"),
      row("race", SeasonPhase.racing, "2026-10-28T00:00:00"),
      row("award", SeasonPhase.awarded, "2026-12-01T00:00:00"),
    ]);
    expect(plan.steps.map((s) => [s.kind, s.row.id])).toEqual([
      ["skip", "pre"],
      ["apply", "race"],
      ["apply", "award"],
    ]);
    expect(plan.final).toBe(SeasonPhase.awarded);
  });

  it("시각이 페이즈 순서와 어긋나도 뒤로 가지 않는다", () => {
    /* SQL로 잘못 넣은 경우 — racing이 recruiting보다 먼저 온다 */
    const plan = planPhaseTransitions(SeasonPhase.pre_apply, [
      row("race", SeasonPhase.racing, "2026-10-14T00:00:00"),
      row("rec", SeasonPhase.recruiting, "2026-10-28T00:00:00"),
    ]);
    expect(plan.steps.map((s) => [s.kind, s.row.id])).toEqual([
      ["apply", "race"],
      ["skip", "rec"],
    ]);
    expect(plan.final).toBe(SeasonPhase.racing);
  });

  it("건너뛰는 행은 그 자리에서 가정한 페이즈를 들고 있다 — 실행 때 다시 확인한다", () => {
    const plan = planPhaseTransitions(SeasonPhase.pre_apply, [
      row("pre", SeasonPhase.pre_apply, "2026-10-01T00:00:00"),
      row("race", SeasonPhase.racing, "2026-10-14T00:00:00"),
      row("rec", SeasonPhase.recruiting, "2026-10-28T00:00:00"),
    ]);
    expect(plan.steps).toEqual([
      expect.objectContaining({ kind: "skip", current: SeasonPhase.pre_apply }),
      expect.objectContaining({ kind: "apply", from: SeasonPhase.pre_apply, to: SeasonPhase.racing }),
      /* 앞 행이 전진한 뒤라 racing을 가정한다 */
      expect.objectContaining({ kind: "skip", current: SeasonPhase.racing }),
    ]);
  });

  it("같은 시각이면 페이즈 순서로 본다", () => {
    const plan = planPhaseTransitions(SeasonPhase.pre_apply, [
      row("race", SeasonPhase.racing, "2026-10-28T00:00:00"),
      row("rec", SeasonPhase.recruiting, "2026-10-28T00:00:00"),
    ]);
    expect(plan.steps.map((s) => s.kind)).toEqual(["apply", "apply"]);
    expect(plan.final).toBe(SeasonPhase.racing);
  });

  it("밀린 행이 없으면 아무것도 안 한다", () => {
    expect(planPhaseTransitions(SeasonPhase.racing, [])).toEqual({
      steps: [],
      final: SeasonPhase.racing,
    });
  });
});

describe("phaseScheduleError — 운영 콘솔 「페이즈 일정」 저장 전 검사", () => {
  const now = KST("2026-09-25T12:00:00");
  const rows = (map: Partial<Record<SeasonPhase, string>>) =>
    [SeasonPhase.pre_apply, SeasonPhase.recruiting, SeasonPhase.racing, SeasonPhase.awarded, SeasonPhase.archived].map(
      (phase) => ({ phase, startsAt: map[phase] ? KST(map[phase]!) : null }),
    );

  it("페이즈 순서대로 시각이 늘면 통과한다(빈 칸은 건너뛴다)", () => {
    expect(
      phaseScheduleError({
        rows: rows({ recruiting: "2026-10-14T00:00:00", racing: "2026-10-28T00:00:00", archived: "2026-12-31T00:00:00" }),
        changed: [SeasonPhase.recruiting, SeasonPhase.racing, SeasonPhase.archived],
        current: SeasonPhase.pre_apply,
        now,
      }),
    ).toBeNull();
  });

  it("뒤 페이즈가 앞 페이즈보다 이르면 막는다", () => {
    expect(
      phaseScheduleError({
        rows: rows({ recruiting: "2026-10-28T00:00:00", racing: "2026-10-14T00:00:00" }),
        changed: [SeasonPhase.racing],
        current: SeasonPhase.pre_apply,
        now,
      }),
    ).toBe("racing 시각이 recruiting보다 늦어야 합니다.");
  });

  it("같은 시각도 막는다", () => {
    expect(
      phaseScheduleError({
        rows: rows({ recruiting: "2026-10-14T00:00:00", racing: "2026-10-14T00:00:00" }),
        changed: [SeasonPhase.racing],
        current: SeasonPhase.pre_apply,
        now,
      }),
    ).toMatch(/racing 시각이 recruiting보다/);
  });

  it("바꾼 행이 지난 시각이고 지금보다 뒤 페이즈면 막는다 — 저장 즉시 넘어간다", () => {
    expect(
      phaseScheduleError({
        rows: rows({ recruiting: "2026-09-25T11:59:00" }),
        changed: [SeasonPhase.recruiting],
        current: SeasonPhase.pre_apply,
        now,
      }),
    ).toMatch(/이미 지났습니다/);
  });

  it("지금과 같거나 앞 페이즈의 지난 시각은 받는다 — 크론이 건너뛸 뿐이다", () => {
    expect(
      phaseScheduleError({
        rows: rows({ pre_apply: "2026-09-01T00:00:00", recruiting: "2026-10-14T00:00:00" }),
        changed: [SeasonPhase.pre_apply],
        current: SeasonPhase.pre_apply,
        now,
      }),
    ).toBeNull();
  });

  it("안 바꾼 행이 지난 시각인 것은 문제 삼지 않는다", () => {
    expect(
      phaseScheduleError({
        rows: rows({ recruiting: "2026-09-25T11:59:00", racing: "2026-10-28T00:00:00" }),
        changed: [SeasonPhase.racing],
        current: SeasonPhase.pre_apply,
        now,
      }),
    ).toBeNull();
  });
});

describe("planPhaseSchedule — 운영 콘솔 「페이즈 일정」 저장 계획", () => {
  const now = KST("2026-09-25T12:00:00");
  const saved = (phase: SeasonPhase, at: string, appliedAt: string | null = null) => ({
    phase,
    startsAt: KST(at),
    appliedAt: appliedAt ? KST(appliedAt) : null,
  });
  const at = (phase: SeasonPhase, s: string | null) => ({ phase, startsAt: s ? KST(s) : null });

  it("바뀐 페이즈만 돌려준다(페이즈 순)", () => {
    expect(
      planPhaseSchedule({
        before: [saved(SeasonPhase.recruiting, "2026-10-14T00:00:00")],
        incoming: [
          at(SeasonPhase.racing, "2026-10-28T00:00:00"),
          at(SeasonPhase.recruiting, "2026-10-14T00:00:00"),
          at(SeasonPhase.pre_apply, null),
        ],
        current: SeasonPhase.pre_apply,
        now,
      }),
    ).toEqual({ ok: true, changed: [SeasonPhase.racing] });
  });

  it("전환 안 된 행을 비우는 것도 바뀐 것이다", () => {
    expect(
      planPhaseSchedule({
        before: [saved(SeasonPhase.racing, "2026-10-28T00:00:00")],
        incoming: [at(SeasonPhase.racing, null)],
        current: SeasonPhase.pre_apply,
        now,
      }),
    ).toEqual({ ok: true, changed: [SeasonPhase.racing] });
  });

  it("바뀐 것이 없으면 막는다", () => {
    expect(
      planPhaseSchedule({
        before: [saved(SeasonPhase.racing, "2026-10-28T00:00:00")],
        incoming: [at(SeasonPhase.racing, "2026-10-28T00:00:00"), at(SeasonPhase.awarded, null)],
        current: SeasonPhase.pre_apply,
        now,
      }),
    ).toEqual({ ok: false, message: "바뀐 일정이 없습니다." });
  });

  it("전환된 행은 바꿀 수 없다", () => {
    expect(
      planPhaseSchedule({
        before: [saved(SeasonPhase.pre_apply, "2026-09-01T00:00:00", "2026-09-01T00:00:10")],
        incoming: [at(SeasonPhase.pre_apply, "2026-09-02T00:00:00")],
        current: SeasonPhase.pre_apply,
        now,
      }),
    ).toEqual({ ok: false, message: "pre_apply는 이미 전환돼 바꿀 수 없습니다." });
  });

  it("전환된 행을 비우는 것도 막는다", () => {
    expect(
      planPhaseSchedule({
        before: [saved(SeasonPhase.pre_apply, "2026-09-01T00:00:00", "2026-09-01T00:00:10")],
        incoming: [at(SeasonPhase.pre_apply, null)],
        current: SeasonPhase.pre_apply,
        now,
      }),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/이미 전환돼/) });
  });

  it("전환된 행을 같은 값으로 다시 보내는 것은 괜찮다 — 바뀐 것으로 치지 않는다", () => {
    expect(
      planPhaseSchedule({
        before: [saved(SeasonPhase.pre_apply, "2026-09-01T00:00:00", "2026-09-01T00:00:10")],
        incoming: [
          at(SeasonPhase.pre_apply, "2026-09-01T00:00:00"),
          at(SeasonPhase.recruiting, "2026-10-14T00:00:00"),
        ],
        current: SeasonPhase.pre_apply,
        now,
      }),
    ).toEqual({ ok: true, changed: [SeasonPhase.recruiting] });
  });

  it("전환된 행과의 순서도 본다 — 받지 않은 칸도 저장된 값으로 센다", () => {
    expect(
      planPhaseSchedule({
        before: [saved(SeasonPhase.recruiting, "2026-09-20T00:00:00", "2026-09-20T00:00:05")],
        incoming: [at(SeasonPhase.racing, "2026-09-19T00:00:00")],
        current: SeasonPhase.recruiting,
        now,
      }),
    ).toEqual({ ok: false, message: "racing 시각이 recruiting보다 늦어야 합니다." });
  });

  it("지금보다 뒤 페이즈를 지난 시각으로 넣으면 막는다", () => {
    expect(
      planPhaseSchedule({
        before: [],
        incoming: [at(SeasonPhase.racing, "2026-09-25T11:00:00")],
        current: SeasonPhase.recruiting,
        now,
      }),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/이미 지났습니다/) });
  });
});

describe("KST datetime-local 값", () => {
  it("언제나 KST로 적는다", () => {
    expect(kstInputValue(new Date("2026-10-27T15:00:00Z"))).toBe("2026-10-28T00:00");
    expect(kstInputValue(KST("2026-10-28T23:59:00"))).toBe("2026-10-28T23:59");
  });

  it("KST로 읽는다 — 브라우저 시간대를 따르지 않는다", () => {
    expect(parseKstInput("2026-10-28T00:00")?.toISOString()).toBe("2026-10-27T15:00:00.000Z");
    expect(parseKstInput("2026-10-28T00:00:00")?.toISOString()).toBe("2026-10-27T15:00:00.000Z");
  });

  it("없는 날과 모양이 틀린 값은 null이다", () => {
    expect(parseKstInput("2026-02-30T00:00")).toBeNull();
    expect(parseKstInput("2026-10-28")).toBeNull();
    expect(parseKstInput("10.28 00:00")).toBeNull();
    expect(parseKstInput("")).toBeNull();
  });
});
