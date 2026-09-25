import { SeasonPhase } from "@/generated/prisma/enums";
import { seoulDateOnly } from "@/lib/measure";
import { prisma } from "@/lib/prisma";
import { devNow } from "@/lib/dev-clock";
import { raceDailyWhere } from "@/lib/race-read";
import { raceEndAt, teamRaceWindow } from "@/lib/race";
import { rankProvisional } from "@/lib/rollup-rank";

/*
  리더보드 롤업 — 팀마다 제 레이스 기간의 지표를 모아 `leaderboard_snapshots`를 갱신한다.

  15분마다 밖에서 부른다(`/api/v1/cron/rollup`). 화면은 이 표만 읽고 순위를
  계산하지 않는다 — 그 원칙이 public-read.ts와 리더보드 화면 주석에 있다.

  ═══════════════════════════════════════════════════════════
  ⚠️ **무엇으로 줄을 세우는가 — 잠정 순위는 유효 이용자 순이다**
  ═══════════════════════════════════════════════════════════

  심사 기준서 v0.3.1은 **최종 순위** 산식 S = (0.6·T + 0.4·R) × C 를 정하고,
  레이스 기간 리더보드는 「'검증 전' 잠정치」라고만 적는다 — 잠정 순위를 무엇으로
  매기는지는 문서에 없다. 그래서 화면과 랜딩이 이미 말하고 있는 기준,
  **유효 이용자 누적**으로 줄을 세운다(2026-09-20 수연 결정).

  그래서 `score`에 숫자를 넣지 않는다(0). 여기 들어가는 값은 심사 점수이고,
  방문자 수를 그 칸에 넣으면 나중에 「그때 우리가 매긴 점수」로 읽힌다.
  `formula_version`도 비운다 — 산식을 적용하지 않았다는 사실 자체가 기록이다.
  무엇을 기준으로 줄을 세웠는지는 `score_breakdown`에 남긴다.

  최종 순위는 증빙 검증 뒤 운영자가 확정한다(`/admin/awards`). 확정된 시즌은
  이 함수가 건드리지 않는다.

  ⚠️ 측정 파이프라인(ADR-006 리버스 프록시)은 아직 없다. `metric_daily`에 행을
  넣는 코드는 개발용 픽스처뿐이라, 지금 이 함수를 돌리면 운영에서는 0으로 채운
  순위가 나온다. 집계가 「돌고 있다」는 사실과 「숫자가 있다」는 것은 다르다.
*/

/** 하루 한 행을 15분마다 덮어쓴다. 주기는 화면의 「롤업 주기 15분」과 같은 값이다 */
export type RollupResult = {
  seasonId: string;
  /** 갱신한 집계일(KST 날짜) */
  snapshotDate: string | null;
  /** 순위를 매긴 팀 수 */
  ranked: number;
  /** 돌지 않았으면 그 이유 */
  skipped?: "not-racing" | "no-entries" | "finalized" | "no-race-window";
};

/*
  집계 구간 — **팀마다 다르다.** 그 팀이 s3을 처음 낸 때(`entries.race_started_at`)부터
  s5 마감까지, 그리고 지금까지. 판정은 race.ts `teamRaceWindow` 하나다.

  옛 정의: 「s4가 열린 때부터 s5 마감까지 — 모든 팀 같은 구간. s4부터인 것은 트래픽이
  그때부터 쌓이기 때문이고(2026-09-06 수연 결정), 「첫 갱신까지」 카운트다운도 같은
  시각을 기준으로 삼는다.」
  → 2026-09-26 뒤집음(수연 지시 「팀별 집계로 바꿔」): 유동 게이트(09-25)로 s3을 내면
  s4가 바로 열려서 「s4 달력 시작일」이 팀의 실제 레이스 시작과 어긋난다. PRD 2장은
  「빨리 배포한 팀이 측정 기간을 길게 가져간다」고 적고, 기획 문서에는 「레이스 기간」의
  정의가 없었다 — 09-06의 기준은 이 주석 하나뿐이었다. 「첫 갱신까지」는 이제 가장
  이른 레이스 시작을 센다(리더보드 화면).
*/

/**
 * 롤업이 쉬는 시즌인가 — 쉬면 그 이유, 아니면 null.
 *
 * 운영 대시보드·지표 검토의 「지연」 판정도 이것을 본다 — 쉬는 동안 마지막
 * 롤업이 낡는 것은 지연이 아니다. 따로 적으면 둘이 어긋난다. 레이스를 시작한
 * 팀이 있는지는 race.ts `rollupHealth`가 본다.
 */
export async function rollupHalt(season: {
  id: string;
  phase: SeasonPhase;
}): Promise<"not-racing" | "finalized" | null> {
  /* 레이스 전에는 셀 것이 없고, 아카이브된 시즌은 더 안 바뀐다 */
  if (
    season.phase !== SeasonPhase.racing &&
    season.phase !== SeasonPhase.awarded
  ) {
    return "not-racing";
  }

  /*
    ⚠️ 확정된 순위는 건드리지 않는다. 운영자가 증빙 검증을 마치고 확정하면
    (`/admin/awards`) 그 표가 정본이고, 그 뒤에 롤업이 덮으면 공개된 최종 순위가
    소리 없이 바뀐다.
  */
  const finalized = await prisma.leaderboardSnapshot.findFirst({
    where: { seasonId: season.id, isFinal: true },
    select: { id: true },
  });
  return finalized ? "finalized" : null;
}

/**
 * 롤업 한 번. 지금 순위를 다시 매겨 오늘 자 스냅샷에 덮어쓴다.
 *
 * 되돌아오는 값은 크론 로그에 남을 요약이다 — 언제 돌았는지, 몇 팀을 셌는지,
 * 안 돌았으면 왜인지.
 */
export async function runRollup(args: {
  seasonId: string;
  now?: Date;
}): Promise<RollupResult> {
  const { seasonId } = args;
  const now = args.now ?? devNow();

  const season = await prisma.season.findUniqueOrThrow({
    where: { id: seasonId },
    select: {
      phase: true,
      stages: {
        select: { stageKey: true, closesAt: true },
      },
    },
  });

  const halt = await rollupHalt({ id: seasonId, phase: season.phase });
  if (halt) return { seasonId, snapshotDate: null, ranked: 0, skipped: halt };

  /*
    실격·포기 팀도 **저장은 한다**(06 §6.3, 스키마 주석). 공개 화면이 지금
    상태를 보고 빼고 번호를 다시 매긴다 — 저장은 전체 기준, 노출은 생존 팀 기준.
    withdrawn까지 포함해 참가한 팀 전부를 센다.
  */
  const entries = await prisma.entry.findMany({
    where: { seasonId },
    select: { id: true, appliedAt: true, createdAt: true, raceStartedAt: true },
  });
  if (entries.length === 0) {
    return { seasonId, snapshotDate: null, ranked: 0, skipped: "no-entries" };
  }

  /* 팀마다 제 구간. 레이스 전 팀은 null — 순위에는 서되 지표가 0이다(race.ts 머리 주석) */
  const endsAt = raceEndAt(season.stages);
  const windows = new Map(
    entries.map((e) => [
      e.id,
      teamRaceWindow({ startedAt: e.raceStartedAt, endsAt, now }),
    ]),
  );
  const racing = [...windows].flatMap(([entryId, win]) => (win ? [{ entryId, win }] : []));
  /* 아무 팀도 레이스를 시작하지 않았으면 셀 것이 없다 — 옛 「s4 전」 자리다 */
  if (racing.length === 0) {
    return { seasonId, snapshotDate: null, ranked: 0, skipped: "no-race-window" };
  }

  /*
    유효 이용자와 매출 합. 구간은 **그 팀의** 레이스 기간이다 — 팀마다 조건 하나씩
    OR로 묶어 한 번에 읽는다(참가팀이 열 단위라 조건이 길지 않다).

    ⚠️ 어뷰징 검수에서 통과하지 못한 날은 뺀다(`manual_review_passed=false`).
    그 칸은 abuse_flags가 걸린 행에만 의미가 있고, 기본값이 true라 검수에 안 걸린
    날은 그대로 들어온다. 검수 중인 숫자를 순위에 얹으면 그게 곧 분쟁이 된다.
    조건은 race-read.ts `raceDailyWhere` 하나다 — 참가작 상세·허브가 같은 것을 쓴다.
  */
  const sums = await prisma.metricDaily.groupBy({
    by: ["entryId"],
    where: {
      OR: racing.map(({ entryId, win }) => raceDailyWhere(entryId, win)),
    },
    _sum: { validVisitors: true, revenue: true },
  });
  const sumByEntry = new Map(sums.map((s) => [s.entryId, s._sum]));

  const ranked = rankProvisional(
    entries.map((entry) => {
      const sum = sumByEntry.get(entry.id);
      return {
        entryId: entry.id,
        validVisitors: sum?.validVisitors ?? 0,
        revenue: sum?.revenue ?? BigInt(0),
        appliedAt: entry.appliedAt ?? entry.createdAt,
      };
    }),
  );

  const snapshotDate = seoulDateOnly(now);

  /*
    무엇을 기준으로 줄을 세웠는지 — 파일 머리 주석. 구간은 **그 팀의** 것이고, 레이스
    전 팀은 구간이 없다(null).
  */
  const breakdown = (row: (typeof ranked)[number]) => {
    const win = windows.get(row.entryId) ?? null;
    return {
      basis: "valid_visitors",
      provisional: true,
      validVisitors: row.validVisitors,
      revenue: row.revenue.toString(),
      windowFrom: win?.from.toISOString() ?? null,
      windowTo: win?.to.toISOString() ?? null,
    };
  };

  /*
    한 트랜잭션으로 쓴다. 중간에 끊기면 어떤 팀은 새 순위, 어떤 팀은 옛 순위인
    표가 공개된다.

    upsert인 것은 하루 한 행(`@@unique([seasonId, entryId, snapshotDate])`)을
    15분마다 덮어쓰기 때문이다. 갱신 시각은 `updated_at`이 들고 있다.
  */
  await prisma.$transaction(
    ranked.map((row, i) =>
      prisma.leaderboardSnapshot.upsert({
        where: {
          seasonId_entryId_snapshotDate: {
            seasonId,
            entryId: row.entryId,
            snapshotDate,
          },
        },
        create: {
          seasonId,
          entryId: row.entryId,
          snapshotDate,
          rank: i + 1,
          /* 점수가 아니라 순서다 — 파일 머리 주석 참조 */
          score: 0,
          validVisitorsTotal: row.validVisitors,
          revenueTotal: row.revenue,
          isFinal: false,
          /*
            축 하한(T≥20, R≥10)은 S 산식이 있어야 판정된다. 잠정 단계에서는
            알 수 없으므로 제외 표시를 하지 않는다 — 모르는 것을 「제외」로
            찍으면 화면에 없는 사실이 뜬다.
          */
          isAwardEligible: true,
          scoreBreakdown: breakdown(row),
        },
        update: {
          rank: i + 1,
          validVisitorsTotal: row.validVisitors,
          revenueTotal: row.revenue,
          isAwardEligible: true,
          scoreBreakdown: breakdown(row),
        },
      }),
    ),
  );

  return {
    seasonId,
    snapshotDate: snapshotDate.toISOString().slice(0, 10),
    ranked: ranked.length,
  };
}
