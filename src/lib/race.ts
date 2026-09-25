import { DeployStatus, StageKey, type SeasonPhase } from "@/generated/prisma/enums";
import { seoulDateOnly } from "@/lib/measure";
import { isRacingOrLater } from "@/lib/season-phase";

/*
  팀별 레이스 — **순수** 판정. DB는 race-read.ts가 읽는다.

  2026-09-26 수연 지시 「팀별 집계로 바꿔」. 근거는 PRD 2장 「팀별 유동 게이트
  (제출·통과 시 즉시 다음 스테이지 오픈)… 빨리 배포한 팀이 측정 기간을 길게
  가져갑니다」다. 기획 문서에는 「레이스 기간」의 정의가 없었고, 그전의 「모든 팀
  s4 달력 시작일부터」는 롤업 주석의 「2026-09-06 수연 결정」 하나뿐이었다 —
  그것을 뒤집었다(rollup.ts 주석).

  정의 — 내가 정함(수연 확인 대기):
    시작  그 팀이 s3을 처음 제출한 때(`entries.race_started_at`). 유동 게이트에서
          s3을 내면 s4가 바로 열리므로(submission.ts `stageRowState`) 그 순간이
          곧 그 팀의 레이스 시작이다.
    끝    s5 실제 마감 — 모든 팀 공통(지금과 같다). 집계 확정 구간은 모두에게
          같아야 한다(submission.ts `stageWindows`의 s5 주석과 같은 이유).
    없음  레이스 전이다. 리더보드에 「미배포」·지표 0으로 선다(PRD FR-F 「미배포
          팀도 레이스에 참여시키되 미배포로 표시, 지표 0, 배포 즉시 합류」).

  ⚠️ 이 구간을 쓰는 숫자는 **전부 같은 규칙**을 거친다 — 리더보드 롤업, 참가작
  상세, 허브·s5 카드, 2차 심사 요약. 한 팀의 숫자가 화면마다 다르면 그게 곧
  분쟁이다. 날짜 단위는 `metric_daily`가 서울 날짜라 거기에 맞춘다.

  심사 기준서의 T2(후반 성장 추세)가 레이스 기간을 이등분하는 것도 이 구간이다 —
  계산 코드는 아직 없다(judgments-view.ts 주석).
*/

const DAY_MS = 86_400_000;

/** 한 팀의 레이스 구간. 날짜 둘은 `metric_daily.metric_date`로 거를 값이다 */
export type RaceWindow = {
  /** 레이스 시작 — 그 팀이 s3을 처음 낸 때 */
  from: Date;
  /** 지금, s5 마감이 지났으면 그 마감 */
  to: Date;
  /** 첫날(서울 날짜, UTC 자정 Date) — 시작한 날은 통째로 센다 */
  firstDay: Date;
  /** 마지막 날(서울 날짜, 포함) */
  lastDay: Date;
};

/** 레이스 끝 — s5 실제 마감. s5는 마지막 게이트라 실제 창의 마감이 곧 달력 마감이다 */
export function raceEndAt(
  stages: readonly { stageKey: StageKey; closesAt: Date | null }[],
): Date | null {
  return stages.find((s) => s.stageKey === StageKey.s5)?.closesAt ?? null;
}

/** 레이스를 시작했는가. 시작 시각이 아직 안 왔으면(개발 시계) 시작 전이다 */
export function raceStarted(startedAt: Date | null, now: Date): boolean {
  return startedAt !== null && startedAt.getTime() <= now.getTime();
}

/**
 * 한 팀의 레이스 구간. 레이스 전이면 null — 셀 것이 없다.
 *
 *   시작 없음            null(레이스 전)
 *   시작이 지금보다 뒤    null(개발 시계가 뒤에 있을 때뿐이다)
 *   시작이 끝보다 늦음    null — s5 마감 뒤에 s3을 낸 팀은 레이스를 뛰지 않았다
 *   s5 마감 뒤           끝은 마감에서 멈춘다
 *
 * 마지막 날은 끝 시각 **직전**의 날이다. 자정 마감(11.17 00:00 = 11.16 24:00)이면
 * 11.16까지 — 마감 뒤의 하루를 세지 않는다(submission.ts `formatDeadline`과 같은 이유).
 * 전에는 s5 마감 시각의 날짜를 그대로 써서 자정 마감이면 하루를 더 셌다.
 */
export function teamRaceWindow(input: {
  startedAt: Date | null;
  /** s5 실제 마감. 일정이 비어 있으면 null — 끝이 없다 */
  endsAt: Date | null;
  now: Date;
}): RaceWindow | null {
  const { startedAt, endsAt, now } = input;
  if (!raceStarted(startedAt, now) || !startedAt) return null;
  if (endsAt && startedAt.getTime() >= endsAt.getTime()) return null;
  const to = endsAt && endsAt.getTime() < now.getTime() ? endsAt : now;
  const firstDay = seoulDateOnly(startedAt);
  const last = seoulDateOnly(new Date(to.getTime() - 1));
  return {
    from: startedAt,
    to,
    firstDay,
    lastDay: last.getTime() < firstDay.getTime() ? firstDay : last,
  };
}

/**
 * 구간을 **어제까지**로 자른다 — 참가작 상세는 전일까지만 공개한다(public-read.ts
 * `loadPublicEntry`). 남는 날이 없으면 null.
 */
export function capBefore(win: RaceWindow | null, today: Date): RaceWindow | null {
  if (!win) return null;
  const yesterday = new Date(seoulDateOnly(today).getTime() - DAY_MS);
  if (yesterday.getTime() < win.firstDay.getTime()) return null;
  return yesterday.getTime() < win.lastDay.getTime() ? { ...win, lastDay: yesterday } : win;
}

/**
 * s4 주차의 기산일 — **팀의 레이스 시작부터 7일씩**(2026-09-26 수연 지시).
 * 아직 시작 전이면 지금처럼 s4 달력 시작일로 센다(`currentWeek`·`weekRange`).
 *
 * 기산은 시작 시각이 아니라 **시작한 날(서울) 0시**다 — 내가 정함(수연 확인 대기).
 * 지표가 하루 단위(`metric_daily`)라 시각으로 끊으면 시작한 날이 어느 주에도 안 들고,
 * 레이스 구간은 그날을 통째로 센다(`teamRaceWindow`). 그래서 1주차는 시작한 날부터
 * 7일, 「이번 주 마감」은 그 마지막 날 23:59다. s4 달력 시작일(0시)과 같은 모양이다.
 */
export function raceWeekBase(
  raceStartedAt: Date | null,
  s4OpensAt: Date | null,
): Date | null {
  if (!raceStartedAt) return s4OpensAt;
  return new Date(seoulDateOnly(raceStartedAt).getTime() - 9 * 3_600_000);
}

/**
 * 리더보드를 여는가 — 진입점(헤더·랜딩·시즌 상세·참가작 상세·대시보드 D7)과
 * 라우트(access-policy `leaderboard`)가 **이것 하나**를 본다.
 *
 * 플래그가 켜져 있고 **레이스를 시작한 팀이 하나라도 있으면** 연다
 * (2026-09-26 수연 지시). 그전에는 보여 줄 순위가 없다. 플래그는 비상용 끄기로
 * 남는다 — 운영자가 끄면 레이스 중이어도 닫힌다.
 *
 * 그전까지는 운영자가 플래그를 s4 달력 시작일에 손으로 켜야 했다(2026-09-20
 * 「시즌1은 s4 시작 전까지 끈다」). 이제는 첫 팀이 s3을 내는 순간 열린다.
 *
 * 페이즈가 레이스 전(모집 중 등)이면 닫는다 — 라우트 정책(access-policy
 * `leaderboard`의 `isRacingOrLater`)과 같은 조건이다. 전에는 이 조건이 DB 래퍼
 * (race-read.ts `withLeaderboardOpen`)에만 있어 이 함수를 바로 부르면 빠졌다
 * (2026-09-26 리뷰 지적). 이제 판정은 전부 여기 있고 래퍼는 재료만 읽는다.
 *
 * 시작 시각이 지금보다 뒤면 아직 안 연다. 운영에서는 일어나지 않고(제출 시각이
 * 곧 시작이다) 개발 시계를 앞뒤로 옮길 때만 갈린다.
 */
export function leaderboardOpen(input: {
  flag: boolean;
  phase: SeasonPhase;
  /** 시즌에서 가장 이른 레이스 시작 */
  firstRaceStartAt: Date | null;
  now: Date;
}): boolean {
  return leaderboardMayOpen(input) && raceStarted(input.firstRaceStartAt, input.now);
}

/**
 * 레이스 시작을 읽기 **전에** 닫힘이 정해지는가 — 정해지면 false. 플래그가 꺼졌거나
 * 레이스 전 페이즈면 `leaderboardOpen`은 시작 시각과 무관하게 닫힘이다. race-read
 * `withLeaderboardOpen`이 이것으로 DB 조회를 건너뛴다(모집 중 관전 트래픽에 조회를
 * 더하지 않는다). 건너뛰어도 답이 같다는 것은 테스트가 고정한다.
 */
export function leaderboardMayOpen(input: { flag: boolean; phase: SeasonPhase }): boolean {
  return input.flag && isRacingOrLater(input.phase);
}

/**
 * 「미배포」인가 — 리더보드 행(public-read `loadLeaderboard`)과 참가작 상세
 * (`loadPublicEntry`)가 **이것 하나**를 본다.
 *
 * 레이스 전이거나(s3 미제출, 2026-09-26 팀별 집계) 측정 주소가 확인되지 않았으면
 * 미배포다. 레이스 전 팀은 측정 연동이 끝났어도(온보딩에서 끝난다) 집계 구간이
 * 없어 숫자가 0이다 — 순위 카드 주석의 「배포 전에는 그 등수가 무엇을 재서 나온
 * 것인지 말할 수 없다」가 그대로 해당된다. 전에는 참가작 상세가 주소만 봐서, 같은
 * 팀이 리더보드에서는 「미배포」, 상세에서는 「✓ 검증됨」·순위로 보였다
 * (2026-09-26 리뷰 지적).
 */
export function notDeployed(
  entry: {
    raceStartedAt: Date | null;
    hostname: { deployStatus: DeployStatus; ownershipVerifiedAt: Date | null } | null;
  },
  now: Date,
): boolean {
  return (
    !raceStarted(entry.raceStartedAt, now) ||
    entry.hostname?.deployStatus !== DeployStatus.active ||
    entry.hostname.ownershipVerifiedAt === null
  );
}

/**
 * 저장 한 번이 레이스 시작을 채우는가 — 채울 값, 아니면 null.
 *
 * **s3을 제출할 때, 아직 비어 있을 때만.** 임시저장은 제출이 아니고, 다시 내도
 * 첫 제출 시각이 남는다. submission-store `saveStage`가 같은 트랜잭션에서
 * 「비어 있을 때만」 조건을 한 번 더 걸어 쓴다(동시에 두 번 눌러도 하나만 남는다).
 */
export function raceStartOnSave(input: {
  stageKey: StageKey;
  intent: "draft" | "submit";
  current: Date | null;
  now: Date;
}): Date | null {
  if (input.stageKey !== StageKey.s3 || input.intent !== "submit") return null;
  return input.current ? null : input.now;
}

/** 운영 대시보드 부제가 말할 롤업 상태 */
export type RollupHealth =
  /** 롤업이 돌 때가 아니다 — 레이스를 시작한 팀이 없거나, 롤업이 쉬는 시즌이다 */
  | { kind: "idle" }
  /** 레이스는 시작했는데 스냅샷이 아직 없다 */
  | { kind: "first"; late: boolean }
  | { kind: "ran"; late: boolean; minutes: number };

/**
 * 롤업이 멈췄는가 — 운영 대시보드의 「지연」.
 *
 * 롤업이 돈 적이 있으면 마지막 롤업에서, 없으면 **가장 이른 레이스 시작**에서
 * 센다(2026-09-26 — 집계가 팀별로 바뀌어 「돌아야 하는 때」가 그 시각이다).
 * 한도를 넘기면 지연이다.
 *
 * 롤업이 쉬는 동안(레이스·시상 페이즈 밖, 순위 확정 뒤 — rollup.ts `rollupHalt`)과
 * 레이스를 시작한 팀이 없는 동안은 스냅샷이 있어도 판정하지 않는다. 쉬는 롤업의
 * 마지막 시각은 낡는 게 정상이다 — 레이스 전 개발 바 픽스처에도 「지연」이 떴다.
 */
export function rollupHealth(input: {
  /** 롤업이 쉬는 시즌인가(rollup.ts `rollupHalt`가 이유를 주면 true) */
  halted: boolean;
  firstRaceStartAt: Date | null;
  lastRollupAt: Date | null;
  now: Date;
  lateMinutes: number;
}): RollupHealth {
  const { halted, firstRaceStartAt, lastRollupAt, now, lateMinutes } = input;
  if (halted || !firstRaceStartAt || !raceStarted(firstRaceStartAt, now)) {
    return { kind: "idle" };
  }
  const since = (at: Date) => Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (lastRollupAt) {
    const minutes = since(lastRollupAt);
    return { kind: "ran", late: minutes > lateMinutes, minutes };
  }
  return { kind: "first", late: since(firstRaceStartAt) > lateMinutes };
}
