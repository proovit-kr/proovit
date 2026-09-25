import { cache } from "react";

import { StageKey, type SeasonPhase } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { devNow } from "@/lib/dev-clock";
import type { FeatureFlags } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import {
  leaderboardMayOpen,
  leaderboardOpen,
  teamRaceWindow,
  type RaceWindow,
} from "@/lib/race";

/*
  팀별 레이스의 **DB 쪽** — 판정은 race.ts(순수)가 하고 여기는 재료를 읽는다.
  같은 구간·같은 검수 필터를 리더보드 롤업·참가작 상세·허브·s5 카드가 나눠 쓴다.
*/

/**
 * 시즌에서 가장 이른 레이스 시작. 아무 팀도 s3을 안 냈으면 null.
 *
 * 리더보드를 여는가(`leaderboardOpen`)와 「첫 갱신까지 N분」·운영 대시보드
 * 「지연」의 기준 시각이 이 값이다. 요청 안에서 한 번만 읽는다 — 헤더·페이지·
 * 접근 판정이 각자 부른다.
 *
 * 상태를 거르지 않는다 — 실격·포기한 팀이 먼저 s3을 냈어도 레이스는 그때 시작됐고
 * 롤업도 그 뒤로 돌아야 한다(롤업이 실격·포기 팀도 저장하는 것과 같은 이유,
 * rollup.ts). 내가 정함(수연 확인 대기).
 */
export const loadFirstRaceStart = cache(async function loadFirstRaceStart(
  seasonId: string,
): Promise<Date | null> {
  const row = await prisma.entry.aggregate({
    where: { seasonId },
    _min: { raceStartedAt: true },
  });
  return row._min.raceStartedAt ?? null;
});

/**
 * 시즌 플래그를 **화면과 접근 판정이 읽는 모양**으로 바꾼다 — `leaderboard`가
 * 날것의 플래그가 아니라 「지금 리더보드를 여는가」(race.ts `leaderboardOpen`)가 된다.
 *
 * 시즌 플래그를 읽는 자리(access.ts `loadViewerState`·season.ts
 * `publicHeaderSeason`·sitemap·`/api/v1/seasons/current`)가 이것을 거친다. 그래서
 * 진입점 여섯 자리(헤더 아카이브 메뉴·P3/P4 CTA·P5 결과 보기, 랜딩 히어로·파이널
 * CTA·전광판 안내, 시즌 상세 「리더보드 보기」, 참가작 상세 「← 리더보드」, 대시보드
 * D7)와 라우트(access-policy `leaderboard`)가 판정 하나를 본다. 날것의 플래그는
 * 운영 콘솔(시즌 관리 토글)만 읽는다.
 *
 * 판정은 전부 race.ts `leaderboardOpen`이 한다 — 여기는 재료(가장 이른 레이스
 * 시작)만 읽는다. 레이스 전 페이즈이거나 플래그가 꺼져 있으면(`leaderboardMayOpen`)
 * 답이 이미 닫힘이라 DB를 안 읽는다 — 모집 중 관전 트래픽에 조회를 더하지 않는다.
 */
export async function withLeaderboardOpen(
  season: { id: string; phase: SeasonPhase },
  flags: FeatureFlags,
  now: Date = devNow(),
): Promise<FeatureFlags> {
  const gate = { flag: flags.leaderboard, phase: season.phase };
  const first = leaderboardMayOpen(gate) ? await loadFirstRaceStart(season.id) : null;
  return {
    ...flags,
    leaderboard: leaderboardOpen({ ...gate, firstRaceStartAt: first, now }),
  };
}

/** 한 팀의 레이스 구간. 참가 기록이 없거나 레이스 전이면 null */
export async function loadTeamRace(
  entryId: string,
  now: Date = devNow(),
): Promise<RaceWindow | null> {
  const entry = await prisma.entry.findUnique({
    where: { id: entryId },
    select: {
      raceStartedAt: true,
      season: {
        select: {
          stages: {
            where: { stageKey: StageKey.s5 },
            select: { closesAt: true },
          },
        },
      },
    },
  });
  if (!entry) return null;
  return teamRaceWindow({
    startedAt: entry.raceStartedAt,
    endsAt: entry.season.stages[0]?.closesAt ?? null,
    now,
  });
}

/**
 * `metric_daily`를 그 팀의 레이스 구간으로 거르는 조건 — 리더보드 롤업과 같다.
 *
 * ⚠️ 어뷰징 검수를 통과하지 못한 날은 뺀다(`manual_review_passed=false`). 롤업이
 * 순위에서 빼는 날을 다른 화면이 세면 같은 팀의 숫자가 두 개가 된다.
 */
export function raceDailyWhere(
  entryId: string,
  win: RaceWindow,
): Prisma.MetricDailyWhereInput {
  return {
    entryId,
    metricDate: { gte: win.firstDay, lte: win.lastDay },
    manualReviewPassed: true,
  };
}

export type RaceTotals = {
  validVisitors: number;
  signups: number;
  revenue: bigint;
  /** 집계된 날 수. 0이면 아직 숫자가 없다 */
  days: number;
};

const NO_TOTALS: RaceTotals = {
  validVisitors: 0,
  signups: 0,
  /* `0n` 리터럴은 tsconfig target(ES2017)에서 못 쓴다 — 값은 같다 */
  revenue: BigInt(0),
  days: 0,
};

/**
 * 레이스 누적 — 리더보드에 행이 없을 때(실격·포기 팀) 허브·s5 카드가 대신 읽는다.
 * 레이스 전이면 전부 0이다.
 */
export async function loadRaceTotals(
  entryId: string,
  now: Date = devNow(),
): Promise<RaceTotals> {
  const win = await loadTeamRace(entryId, now);
  if (!win) return NO_TOTALS;
  const sum = await prisma.metricDaily.aggregate({
    where: raceDailyWhere(entryId, win),
    _count: { _all: true },
    _sum: { validVisitors: true, signups: true, revenue: true },
  });
  return {
    validVisitors: sum._sum.validVisitors ?? 0,
    signups: sum._sum.signups ?? 0,
    revenue: sum._sum.revenue ?? BigInt(0),
    days: sum._count._all,
  };
}
