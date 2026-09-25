/*
  시즌 페이즈의 **순수** 부분. DB를 건드리지 않는다.
  season.ts는 prisma를 import하므로, 판정만 필요한 곳(access-policy.ts·테스트)이
  거기서 가져오면 DB 클라이언트가 따라온다 — access-policy.ts 머리 주석과 같은 이유다.
*/

import { SeasonPhase } from "@/generated/prisma/enums";

const PHASE_RANK: Record<SeasonPhase, number> = {
  draft: 0,
  pre_apply: 1,
  recruiting: 2,
  racing: 3,
  awarded: 4,
  archived: 5,
};

export function phaseAtLeast(phase: SeasonPhase, min: SeasonPhase): boolean {
  return PHASE_RANK[phase] >= PHASE_RANK[min];
}

/*
  ─────────────────────────────────────────────────────────────
  의미 술어 — phase 값에 직접 기대지 않기 위한 한 겹.

  ✅ **2026-08-14: 6값으로 확정됐다.** 동혁이 종결본 스키마를 고쳐
  `draft · pre_apply · recruiting · racing · awarded · archived`가 됐고
  (8/13 스크럼 회신), 이제 PLN3 화면정의서 분기표와 같은 모델이다.

  전날 10값(`w1_demand ~ gate2_review`)으로 이식해 두었는데, 판정이 값을
  직접 비교하지 않고 이 술어만 부르게 해 둔 덕에 **고친 곳은 이 파일과
  season.ts 한 줄이고 canAccess·화면 34개는 손대지 않았다.**

  ⚠️ 사라진 것 하나: `isGateReview()`. 게이트 심사 구간이 phase에 없으므로
  「심사 중 제출 잠금」은 **팀별 상태로 판정한다** — `entry.stage`가 게이트
  스테이지(s2·s5)에 멈춘 팀이 판정 대기다. access-policy.ts의
  `isAwaitingGate()`가 그 자리를 받는다. phase로 되돌리지 말 것.
  ─────────────────────────────────────────────────────────────
*/

/** 아직 공개 전. 운영자만 본다 */
export function isDraft(phase: SeasonPhase): boolean {
  return phase === SeasonPhase.draft;
}

/** 사전신청만 받는 구간 — 참가 신청은 아직 닫혀 있다 */
export function isPreApply(phase: SeasonPhase): boolean {
  return phase === SeasonPhase.pre_apply;
}

/** 참가 신청을 받는 구간. `/apply`가 열린다 */
export function isRecruiting(phase: SeasonPhase): boolean {
  return phase === SeasonPhase.recruiting;
}

/**
 * 시즌 본편이 돌아가는 구간. 게이트 심사 기간도 여기 든다 —
 * 제출만 잠기고 대시보드·리더보드는 그대로 살아 있어야 한다.
 * 스테이지별 제출 창은 `stages.opens_at`·`closes_at`이 따로 판정한다.
 */
export function isRacing(phase: SeasonPhase): boolean {
  return phase === SeasonPhase.racing;
}

/** 시상 발표 이후. 정산 액션이 열린다 */
export function isAwarded(phase: SeasonPhase): boolean {
  return phase === SeasonPhase.awarded;
}

/** 아카이브 — 모든 쓰기가 막힌다(요구사항 명세서 G4) */
export function isArchived(phase: SeasonPhase): boolean {
  return phase === SeasonPhase.archived;
}

/**
 * 모집이 열린 뒤로는 계속 참인가 — 모집·레이스·시상·아카이브.
 *
 * 가르는 것은 **사전 신청만 받던 구간과 그 뒤**다. 회원 가입과 참가 신청이
 * 열리면서 받는 개인정보가 늘어나므로, 개인정보처리방침이 이 자리에서 갈린다
 * (`content/privacy.ts`).
 */
export function isRecruitingOrLater(phase: SeasonPhase): boolean {
  return phaseAtLeast(phase, SeasonPhase.recruiting);
}

/**
 * 레이스가 시작된 뒤로는 계속 참인가 — 레이스·시상·아카이브.
 *
 * `isRacing`과 갈라 쓰는 자리가 **공개 조회 화면**이다. 리더보드와 참가작
 * 페이지를 `isRacing`으로 막아 두면 시상 발표와 동시에 닫힌다. 관전 트래픽이
 * 가장 몰리는 때가 바로 그때고, 시즌이 끝난 뒤에 남는 것이 순위와 참가작이라
 * 이 리그가 다음 시즌 모집에 쓸 유일한 증거이기도 하다.
 *
 * 쓰기는 이 술어를 쓰지 않는다 — 아카이브 잠금(G4)은 canAccess가 따로 본다.
 */
export function isRacingOrLater(phase: SeasonPhase): boolean {
  return phaseAtLeast(phase, SeasonPhase.racing);
}

/*
  ─────────────────────────────────────────────────────────────
  페이즈 자동 전환 — 크론(`/api/v1/cron/phase`)이 부르는 계획.

  2026-09-25 수연 지시 「페이즈 전환 — 자동 전환 크론 개발해줘」. 정본은
  `season_schedules`다(ADR-010, PRD FR-C1). 여기는 **무엇을 할지만** 정하고
  DB는 `phase-schedule.ts`가 쓴다.

  ⚠️ **뒤로는 절대 안 간다.** 예정 시각이 지난 행이라도 그 페이즈가 지금과
  같거나 앞이면 건너뛴다. 운영자가 수동으로 앞당겼거나(모집을 일찍 닫음)
  되돌린 뒤라는 뜻이고, 그 판단을 크론이 덮으면 수동 전환이 1분짜리가 된다.
  ─────────────────────────────────────────────────────────────
*/

/** 운영 콘솔이 일정을 받는 페이즈 — draft는 시작점이라 전환 대상이 아니다 */
export const SCHEDULE_PHASES = [
  SeasonPhase.pre_apply,
  SeasonPhase.recruiting,
  SeasonPhase.racing,
  SeasonPhase.awarded,
  SeasonPhase.archived,
] as const;

/** 크론이 건너뛴 행의 `note`. 운영 콘솔이 이 값으로 잠긴 「이미 넘어감」을 가른다 */
export const PHASE_SKIP_NOTE = "이미 지난 페이즈라 건너뜀";

/** 예정 시각이 지났고 아직 처리 안 된(`applied_at` 빈) 일정 행 */
export type DueScheduleRow = { id: string; phase: SeasonPhase; startsAt: Date };

export type PhaseStep =
  | { kind: "apply"; row: DueScheduleRow; from: SeasonPhase; to: SeasonPhase }
  /** `current`는 계획이 그 자리에서 가정한 시즌 페이즈 — 건너뛸 때도 이것을 다시 확인한다 */
  | { kind: "skip"; row: DueScheduleRow; current: SeasonPhase };

/**
 * 한 시즌의 밀린 일정 행을 전진(apply)과 건너뜀(skip)으로 가른다.
 *
 * 시각 순으로 훑으며 지금보다 뒤 페이즈일 때만 전진한다. 여러 행이 한꺼번에
 * 밀려 있으면(크론이 멈췄다 살아난 경우) 차례로 전진해 마지막 것이 최종
 * 페이즈다 — 한 번에 건너뛰지 않는 것은 전환마다 감사 로그가 한 줄씩 남아야
 * 「언제 무엇이 열렸나」를 나중에 되짚을 수 있어서다.
 */
export function planPhaseTransitions(
  current: SeasonPhase,
  due: readonly DueScheduleRow[],
): { steps: PhaseStep[]; final: SeasonPhase } {
  /* 같은 시각이면 페이즈 순서로 — 입력 순서에 결과가 흔들리지 않게 */
  const rows = [...due].sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() ||
      PHASE_RANK[a.phase] - PHASE_RANK[b.phase],
  );
  const steps: PhaseStep[] = [];
  let phase = current;
  for (const row of rows) {
    if (PHASE_RANK[row.phase] > PHASE_RANK[phase]) {
      steps.push({ kind: "apply", row, from: phase, to: row.phase });
      phase = row.phase;
    } else {
      steps.push({ kind: "skip", row, current: phase });
    }
  }
  return { steps, final: phase };
}

/**
 * 운영 콘솔 「페이즈 일정」 저장 전 검사. 통과하면 null, 막히면 문구.
 *
 *   rows     저장 뒤 모양(전환된 행 포함) — 페이즈 순서대로 시각이 늘어야 한다
 *   changed  이번에 바뀐 페이즈
 *
 * ⚠️ 바뀐 행이 **이미 지난 시각이고 지금보다 뒤 페이즈**면 막는다. 저장하는
 * 순간 다음 크론(15분 안)이 전환한다 — 연도 오타 하나로 운영 페이즈가 넘어간다.
 * 지금 넘기려면 「페이즈 수동 전환」이 그 자리다(내가 정함, 수연 확인 대기).
 * 지금과 같거나 앞 페이즈의 지난 시각은 받는다 — 크론이 건너뛰기만 하고,
 * 사전 신청 시작처럼 기록으로 남겨 둘 값일 수 있다(header-read의 전환율 기간).
 */
export function phaseScheduleError(args: {
  rows: readonly { phase: SeasonPhase; startsAt: Date | null }[];
  changed: readonly SeasonPhase[];
  current: SeasonPhase;
  now: Date;
}): string | null {
  const filled = args.rows
    .filter((r): r is { phase: SeasonPhase; startsAt: Date } => r.startsAt !== null)
    .sort((a, b) => PHASE_RANK[a.phase] - PHASE_RANK[b.phase]);
  for (const [i, row] of filled.entries()) {
    const prev = filled[i - 1];
    if (prev && prev.startsAt >= row.startsAt) {
      return `${row.phase} 시각이 ${prev.phase}보다 늦어야 합니다.`;
    }
  }

  for (const phase of args.changed) {
    const at = args.rows.find((r) => r.phase === phase)?.startsAt ?? null;
    if (at && at <= args.now && PHASE_RANK[phase] > PHASE_RANK[args.current]) {
      return `${phase} 시각이 이미 지났습니다. 지금 넘기려면 페이즈 수동 전환을 써 주세요.`;
    }
  }
  return null;
}

/** 저장된 일정 행 — `applied_at`이 있으면 크론·수동 전환이 이미 처리한 행이다 */
export type SavedScheduleRow = { phase: SeasonPhase; startsAt: Date; appliedAt: Date | null };

/**
 * 운영 콘솔 「페이즈 일정」 저장 계획 — admin-store `setPhaseSchedule`이 DB에
 * 쓰기 전에 부른다. 막히면 문구, 통과하면 이번에 바뀐 페이즈(페이즈 순).
 *
 *   before    저장된 행 전부(처리된 행 포함)
 *   incoming  이번에 받은 칸. 빠진 페이즈는 그대로 두고, null은 비운다
 *
 * ⚠️ **처리된 행(`applied_at`)은 못 바꾼다** — 이미 일어난 일의 기록이다. 같은
 * 값으로 다시 보내는 것은 바뀐 것으로 치지 않는다. 그래도 순서 검사에는 넣는다 —
 * 전환된 모집 시작보다 이른 레이스 시작은 받지 않는다.
 */
export function planPhaseSchedule(args: {
  before: readonly SavedScheduleRow[];
  incoming: readonly { phase: SeasonPhase; startsAt: Date | null }[];
  current: SeasonPhase;
  now: Date;
}): { ok: false; message: string } | { ok: true; changed: SeasonPhase[] } {
  const before = new Map(args.before.map((r) => [r.phase, r]));
  const incoming = new Map(args.incoming.map((r) => [r.phase, r.startsAt]));
  const time = (d: Date | null | undefined) => d?.getTime() ?? null;

  for (const [phase, at] of incoming) {
    const b = before.get(phase);
    if (b?.appliedAt && time(b.startsAt) !== time(at)) {
      return { ok: false, message: `${phase}는 이미 전환돼 바꿀 수 없습니다.` };
    }
  }
  const changed = SCHEDULE_PHASES.filter(
    (phase) => incoming.has(phase) && time(before.get(phase)?.startsAt) !== time(incoming.get(phase)),
  );
  if (changed.length === 0) return { ok: false, message: "바뀐 일정이 없습니다." };

  const rows = SCHEDULE_PHASES.map((phase) => ({
    phase,
    startsAt: incoming.has(phase)
      ? (incoming.get(phase) ?? null)
      : (before.get(phase)?.startsAt ?? null),
  }));
  const error = phaseScheduleError({ rows, changed, current: args.current, now: args.now });
  return error ? { ok: false, message: error } : { ok: true, changed };
}
