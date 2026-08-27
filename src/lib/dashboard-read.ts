import { StageKey, SubmissionStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/*
  참가자 **읽기 전용** 화면의 조회 — 심사 결과·내 지표.

  쓰기가 없어서 store를 따로 두지 않고 한 파일에 모았다. 두 화면 다 "값이 아직
  없다"가 정상 상태라, 조회 함수는 빈 배열을 돌려주고 **화면이 빈 상태를 그린다.**

  ⚠️ 없는 값을 만들어 채우지 않는다(CLAUDE.md 규칙 1). 순위·전환율·추정치처럼
  DB에 없는 것은 계산해서 보여주지 않는다 — 채점식이 확정되지 않았고, 그전에
  숫자를 띄우면 그게 곧 우리가 파는 「검증된 지표」의 반례가 된다.
*/

export type StageJudgment = {
  stageKey: StageKey;
  name: string;
  isGate: boolean;
  /** 제출을 냈는가. 안 낸 게이트는 판정이 있을 수 없다 */
  submissionStatus: SubmissionStatus | null;
  submittedAt: Date | null;
  judgment: {
    result: string;
    feedback: string | null;
    /** 채점식 버전 — 그때 규칙으로는 이랬다는 증명 */
    formulaVersion: string | null;
    /** 2차는 배점까지 공개, 1차는 결과와 근거만(API v0.2 §9.1) */
    scoreBreakdown: unknown;
    judgedAt: Date;
  } | null;
};

/**
 * 게이트별 판정.
 *
 * 게이트가 아닌 스테이지도 함께 돌려준다 — 참가자가 보는 것은 「내 시즌이 어디까지
 * 왔는가」이고, 게이트만 보이면 그 사이가 비어 사고 흐름이 끊긴다.
 */
export async function loadJudgments(
  entryId: string,
  seasonId: string,
): Promise<StageJudgment[]> {
  const [stages, submissions] = await Promise.all([
    prisma.stage.findMany({
      where: { seasonId },
      orderBy: { stageKey: "asc" },
      select: { stageKey: true, name: true, isGate: true },
    }),
    prisma.submission.findMany({
      where: { entryId },
      select: {
        stageKey: true,
        status: true,
        submittedAt: true,
        judgments: {
          orderBy: { judgedAt: "desc" },
          take: 1,
          select: {
            result: true,
            feedback: true,
            formulaVersion: true,
            scoreBreakdown: true,
            judgedAt: true,
          },
        },
      },
    }),
  ]);

  const byStage = new Map(submissions.map((s) => [s.stageKey, s]));

  return stages.map((stage) => {
    const submission = byStage.get(stage.stageKey);
    const judgment = submission?.judgments[0] ?? null;
    return {
      stageKey: stage.stageKey,
      name: stage.name,
      isGate: stage.isGate,
      submissionStatus: submission?.status ?? null,
      submittedAt: submission?.submittedAt ?? null,
      judgment: judgment
        ? {
            result: judgment.result,
            feedback: judgment.feedback,
            formulaVersion: judgment.formulaVersion,
            scoreBreakdown: judgment.scoreBreakdown,
            judgedAt: judgment.judgedAt,
          }
        : null,
    };
  });
}

export type DailyMetric = {
  date: Date;
  validVisitors: number;
  signups: number;
  revenue: bigint;
  source: string;
  /** 어뷰징 검수에서 걸린 날. 걸린 건에만 뜻이 있다 */
  flagged: boolean;
};

export type MetricsView = {
  daily: DailyMetric[];
  totals: { validVisitors: number; signups: number; revenue: bigint };
  /** 참고 지표(채점 축이 아닌 것)가 하나라도 있는가 */
  hasExtra: boolean;
  /**
   * 유입 채널. 기간 합계를 방문 많은 순으로 준다.
   * ⚠️ 비율은 여기서 내지 않는다 — 화면이 자기 분모로 나눈다. 「상위 3」만 보여줄
   * 때와 전체를 보여줄 때 분모가 다르고, 그걸 여기서 정하면 화면이 못 바꾼다.
   */
  channels: { channel: string; visitors: number }[];
};

/**
 * 내 지표.
 *
 * 채점 축(유효 방문·가입·매출)만 표로 보여준다. 참고 지표는 `metric_extra_daily`에
 * 있는데 **무엇을 참고 지표로 셀지가 아직 정해지지 않았다**(PLN6 6장 1번 유효 이용자
 * 정의). 정의가 오면 그때 이 함수에 한 덩어리가 붙는다.
 *
 * ⚠️ 순위를 여기서 계산하지 않는다. 순위는 `leaderboard_snapshots`가 정본이고
 * 그 산식이 미확정이다 — 화면마다 다르게 계산하면 그게 곧 분쟁이 된다.
 */
export async function loadMetrics(
  entryId: string,
  days: number = 30,
): Promise<MetricsView> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  const rows = await prisma.metricDaily.findMany({
    where: { entryId, metricDate: { gte: since } },
    orderBy: { metricDate: "desc" },
    select: {
      metricDate: true,
      validVisitors: true,
      signups: true,
      revenue: true,
      source: true,
      manualReviewPassed: true,
    },
  });

  const [extra, channels] = await Promise.all([
    prisma.metricExtraDaily.count({ where: { entryId } }),
    /*
      채널은 하루 × 채널로 쌓여 있어 기간 합계를 DB에서 접는다.
      채널명은 참가자가 정하는 UTM 값이라 열려 있다(스키마 주석) — 여기서
      아는 이름으로 묶거나 이름을 바꾸지 않는다.
    */
    prisma.metricChannelDaily.groupBy({
      by: ["channel"],
      where: { entryId, metricDate: { gte: since } },
      _sum: { visitors: true },
      orderBy: { _sum: { visitors: "desc" } },
    }),
  ]);

  return {
    daily: rows.map((row) => ({
      date: row.metricDate,
      validVisitors: row.validVisitors,
      signups: row.signups,
      revenue: row.revenue,
      source: row.source,
      flagged: !row.manualReviewPassed,
    })),
    totals: {
      validVisitors: rows.reduce((sum, r) => sum + r.validVisitors, 0),
      signups: rows.reduce((sum, r) => sum + r.signups, 0),
      /* `0n` 리터럴은 tsconfig target(ES2017)에서 못 쓴다 — 값은 같다 */
      revenue: rows.reduce((sum, r) => sum + r.revenue, BigInt(0)),
    },
    hasExtra: extra > 0,
    channels: channels.map((row) => ({
      channel: row.channel,
      visitors: row._sum.visitors ?? 0,
    })),
  };
}
