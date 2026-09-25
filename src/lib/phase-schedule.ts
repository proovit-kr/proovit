import type { Prisma } from "@/generated/prisma/client";
import type { SeasonPhase } from "@/generated/prisma/enums";
import { writeAudit } from "@/lib/admin-store";
import { devNow } from "@/lib/dev-clock";
import { prisma } from "@/lib/prisma";
import {
  PHASE_SKIP_NOTE,
  planPhaseTransitions,
  type DueScheduleRow,
  type PhaseStep,
} from "@/lib/season-phase";

/*
  페이즈 자동 전환 — `season_schedules`를 읽어 `seasons.phase`를 넘긴다.

  2026-09-25 수연 지시 「페이즈 전환 — 자동 전환 크론 개발해줘」.
  ADR-010(스키마 SeasonSchedule 주석 「페이즈 전환의 유일한 정본. 크론이 이
  표만 읽는다」), PRD FR-C1(P0) · NFR-O1 · AC-3. 15분마다 `/api/v1/cron/phase`가
  부른다 — 왜 15분인지는 그 라우트 머리 주석에 있다.

  무엇을 할지(전진·건너뜀)는 순수 함수 `planPhaseTransitions`(season-phase.ts)가
  정한다. 여기서는 그대로 쓰기만 한다.

  ⚠️ **읽은 뒤에 바뀐 것은 손대지 않는다.** 계획은 읽은 순간의 값으로 세웠다.
  행마다 한 트랜잭션에서 두 가지를 조건부 갱신으로 다시 확인하고, 하나라도
  0건이면 트랜잭션을 되돌린 뒤 그 시즌은 이번 실행에서 놓는다 — 다음 실행이 새 값으로
  다시 계획한다.
    · 시즌 페이즈가 계획 때 그대로인가 — 운영자의 수동 전환, 같은 때 겹친
      다른 크론 실행(Vercel 크론은 드물게 두 번 부른다)
    · 일정 행이 `applied_at IS NULL`이고 **예정 시각이 아직 지났는가** — 마감
      직전에 운영자가 「모집 연장」으로 행을 미뤘으면 옛 시각에 넘기지 않는다
  스키마 주석 「중복 실행돼도 null인 행만 처리한다」가 이것이다.

  ⚠️ **시즌 행부터 잡는다.** 수동 전환(admin-store `setSeasonPhase`)이 시즌 →
  일정 순으로 쓰므로 같은 순서라야 둘이 서로를 기다리다 교착하지 않는다.
  건너뛸 때도 시즌 행을 같은 값으로 덮어 잡는다 — 조건부 갱신이 곧 잠금이다
  (credits-store와 같은 수). 그래서 건너뛴 행마다 `seasons.updated_at`이 한 번 움직인다.

  ⚠️ 수동 전환(admin-store `setSeasonPhase`)과 같은 모양으로 감사 로그를
  남긴다(`season.phase`, meta from/to). 다른 것은 actor가 없다는 것(감사 로그
  화면에 「system」)과 meta의 `by: "cron"`이다.
*/

/** 판정 시각이 지났고 아직 처리 안 된 행을 모은 뒤, 시즌별로 돈 결과 */
export type PhaseScheduleResult = {
  /** 판정에 쓴 「지금」 */
  at: string;
  transitions: { seasonId: string; from: SeasonPhase; to: SeasonPhase; scheduleId: string }[];
  /** 이미 같거나 지난 페이즈라 건너뛴 행 */
  skipped: { seasonId: string; phase: SeasonPhase; scheduleId: string }[];
  /** 다른 실행·수동 전환·일정 수정과 겹쳐 이번 실행에서 손대지 않은 시즌 수 */
  raced: number;
};

/**
 * 계획을 세운 뒤 바뀐 것이 있다 — 트랜잭션을 되돌리는 신호.
 *   moved  시즌 페이즈가 계획 때와 다르다
 *   taken  일정 행이 이미 처리됐거나 예정 시각이 바뀌었다
 */
class Stale extends Error {
  constructor(readonly outcome: "moved" | "taken") {
    super(outcome);
  }
}

type ApplyStep = Extract<PhaseStep, { kind: "apply" }>;
type SkipStep = Extract<PhaseStep, { kind: "skip" }>;

/**
 * 일정 행을 조건부로 처리됨으로 찍는다. 0건이면 되돌린다.
 *
 * 예정 시각은 「읽은 값과 같은가」가 아니라 「아직 지났는가」로 다시 본다.
 * 칸이 `timestamptz(6)`이라 SQL로 넣은 행은 마이크로초가 붙을 수 있고, 밀리초인
 * JS Date와 같음 비교를 하면 그 행은 영영 안 잡힌다. 미룬 행은 이것으로 걸러지고,
 * 다른 지난 시각으로 옮기는 것은 운영 콘솔이 앞 페이즈에 한해 막는다(`phaseScheduleError`).
 */
async function claimRow(
  tx: Prisma.TransactionClient,
  row: DueScheduleRow,
  now: Date,
  data: { appliedAt: Date; note?: string },
): Promise<void> {
  const claimed = await tx.seasonSchedule.updateMany({
    where: { id: row.id, appliedAt: null, startsAt: { lte: now } },
    data,
  });
  if (claimed.count === 0) throw new Stale("taken");
}

/** 트랜잭션 하나를 돌리고, 되돌림 신호는 결과로 바꾼다 */
async function inTx<T extends string>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T | "moved" | "taken"> {
  try {
    return await prisma.$transaction(fn);
  } catch (error) {
    if (error instanceof Stale) return error.outcome;
    throw error;
  }
}

/** 전진 한 번. 페이즈 → 점유 → 감사 로그가 한 트랜잭션이다 */
function applyStep(seasonId: string, step: ApplyStep, now: Date, stamp: Date) {
  return inTx(async (tx) => {
    const moved = await tx.season.updateMany({
      where: { id: seasonId, phase: step.from },
      data: { phase: step.to },
    });
    if (moved.count === 0) throw new Stale("moved");
    await claimRow(tx, step.row, now, { appliedAt: stamp });

    await writeAudit(tx, {
      actorId: null,
      action: "season.phase",
      targetType: "season",
      targetId: seasonId,
      reason: "예정 일정에 따른 자동 전환",
      meta: {
        from: step.from,
        to: step.to,
        scheduleId: step.row.id,
        scheduledAt: step.row.startsAt.toISOString(),
        by: "cron",
      },
    });
    return "applied" as const;
  });
}

/**
 * 건너뜀 한 번 — 페이즈는 그대로 두고 행만 처리됨으로 찍는다. 계획 때의 페이즈가
 * 그대로인지는 여기서도 본다. 그 사이 수동으로 되돌렸으면 이 행은 이제 전진이다.
 */
function skipStep(seasonId: string, step: SkipStep, now: Date, stamp: Date) {
  return inTx(async (tx) => {
    const held = await tx.season.updateMany({
      where: { id: seasonId, phase: step.current },
      data: { phase: step.current },
    });
    if (held.count === 0) throw new Stale("moved");
    await claimRow(tx, step.row, now, { appliedAt: stamp, note: PHASE_SKIP_NOTE });
    return "skipped" as const;
  });
}

/**
 * 밀린 일정을 한 번 처리한다. 돌려주는 값은 크론 로그에 남을 요약이다.
 *
 * `now`는 **판정에만** 쓴다(dev-clock.ts 규칙). 운영 빌드에서 `devNow()`는
 * 파일을 읽지 않고 곧바로 진짜 지금이다(`devToolsEnabled`가 거짓) — 개발
 * 시계가 운영 전환 시각을 옮기는 일은 없다. `applied_at`은 언제나 진짜 지금이다.
 */
export async function runPhaseSchedule(args: { now?: Date } = {}): Promise<PhaseScheduleResult> {
  const now = args.now ?? devNow();
  const stamp = new Date();
  const result: PhaseScheduleResult = {
    at: now.toISOString(),
    transitions: [],
    skipped: [],
    raced: 0,
  };

  const due = await prisma.seasonSchedule.findMany({
    where: { appliedAt: null, startsAt: { lte: now } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      seasonId: true,
      phase: true,
      startsAt: true,
      season: { select: { phase: true } },
    },
  });
  if (due.length === 0) return result;

  const bySeason = new Map<string, { current: SeasonPhase; rows: DueScheduleRow[] }>();
  for (const row of due) {
    const group = bySeason.get(row.seasonId) ?? { current: row.season.phase, rows: [] };
    group.rows.push({ id: row.id, phase: row.phase, startsAt: row.startsAt });
    bySeason.set(row.seasonId, group);
  }

  for (const [seasonId, { current, rows }] of bySeason) {
    const { steps } = planPhaseTransitions(current, rows);
    for (const step of steps) {
      const outcome =
        step.kind === "skip"
          ? await skipStep(seasonId, step, now, stamp)
          : await applyStep(seasonId, step, now, stamp);
      if (outcome === "moved" || outcome === "taken") {
        /* 이 시즌은 다음 실행에서 새 상태로 다시 계획한다 */
        result.raced += 1;
        break;
      }
      if (step.kind === "skip") {
        result.skipped.push({ seasonId, phase: step.row.phase, scheduleId: step.row.id });
      } else {
        result.transitions.push({ seasonId, from: step.from, to: step.to, scheduleId: step.row.id });
      }
    }
  }

  return result;
}
