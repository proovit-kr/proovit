import { DeployStatus, JudgmentResult, StageKey } from "@/generated/prisma/enums";
import { gateOneNumbers } from "@/lib/hub-read";
import {
  buildJudgmentsView,
  type GateJudgment,
  type JudgmentsView,
} from "@/lib/judgments-view";
import { seoulDateOnly } from "@/lib/measure";
import { buildMetricsView, metricsWindow, type MetricsView } from "@/lib/metrics-view";
import { prisma } from "@/lib/prisma";

/*
  참가자 **읽기 전용** 화면의 조회 — 심사 결과·내 지표.

  쓰기가 없어서 store를 따로 두지 않고 한 파일에 모았다. 두 화면 다 "값이 아직
  없다"가 정상 상태라, 조회 함수는 빈 배열을 돌려주고 **화면이 빈 상태를 그린다.**

  ⚠️ 없는 값을 만들어 채우지 않는다(CLAUDE.md 규칙 1). 순위·추정치처럼 DB에
  없는 것은 계산해서 보여주지 않는다 — 채점식이 확정되지 않았고, 그전에 숫자를
  띄우면 그게 곧 우리가 파는 「검증된 지표」의 반례가 된다. 전환율만 예외다 —
  시안 ver4가 카드로 그린다(2026-09-23).
*/

/**
 * 심사 결과 — 시안 ver4 `#scr-judgments`.
 *
 * 게이트 둘(s2·s5)의 최신 판정을 읽고, 판·요지·기한·점수표는 `judgments-view.ts`가
 * 만든다. 1차의 `score_breakdown`은 읽지 않는다 — 배점은 비공개다(규칙 제9조).
 */
export async function loadJudgmentsView(entryId: string): Promise<JudgmentsView> {
  const gates = await prisma.submission.findMany({
    where: { entryId, stageKey: { in: [StageKey.s2, StageKey.s5] } },
    select: {
      stageKey: true,
      judgments: {
        orderBy: { judgedAt: "desc" },
        take: 1,
        select: { result: true, feedback: true, judgedAt: true, scoreBreakdown: true },
      },
    },
  });
  const latest = (key: StageKey): GateJudgment | null => {
    const j = gates.find((g) => g.stageKey === key)?.judgments[0];
    if (!j) return null;
    return {
      result: j.result,
      feedback: j.feedback,
      judgedAt: j.judgedAt,
      scoreBreakdown: key === StageKey.s5 ? j.scoreBreakdown : null,
    };
  };
  const gate1 = latest(StageKey.s2);
  const gate2 = latest(StageKey.s5);
  const numbers =
    gate1?.result === JudgmentResult.fail ? await gateOneNumbers(entryId) : "";
  return buildJudgmentsView({ gate1, gate2, gateOneNumbers: numbers });
}

export type MyMetrics = MetricsView & {
  hostname: { registered: boolean; hostname: string | null; verified: boolean };
};

/**
 * 내 지표 — 시안 ver4 `#scr-mymetrics`.
 *
 * 어제까지 14일의 일별 집계와 7일의 채널 집계를 읽고, 판·카드·차트·채널은
 * `metrics-view.ts`가 만든다. 시안이 전환율을 그리므로 여기서만 나눈다 —
 * 순위·점수는 여전히 만들지 않는다(리더보드 스냅샷이 정본).
 *
 * `now`는 `devNow()` — 개발 바가 「오늘」을 옮기면 창도 같이 옮겨야 한다.
 */
export async function loadMyMetrics(entryId: string, now: Date): Promise<MyMetrics> {
  const today = seoulDateOnly(now);
  const { chartFrom, weekFrom, to } = metricsWindow(today);

  const [rows, channels, hostname] = await Promise.all([
    prisma.metricDaily.findMany({
      where: { entryId, metricDate: { gte: chartFrom, lt: to } },
      select: { metricDate: true, validVisitors: true, signups: true },
    }),
    prisma.metricChannelDaily.findMany({
      where: { entryId, metricDate: { gte: weekFrom, lt: to } },
      select: { metricDate: true, channel: true, visitors: true },
    }),
    prisma.hostname.findUnique({
      where: { entryId },
      select: { hostname: true, deployStatus: true, ownershipVerifiedAt: true },
    }),
  ]);

  return {
    ...buildMetricsView({
      rows: rows.map((r) => ({
        date: r.metricDate,
        visitors: r.validVisitors,
        signups: r.signups,
      })),
      channels: channels.map((c) => ({
        date: c.metricDate,
        channel: c.channel,
        visitors: c.visitors,
      })),
      today,
    }),
    hostname: {
      registered: hostname !== null,
      hostname: hostname?.hostname ?? null,
      verified:
        hostname?.deployStatus === DeployStatus.active &&
        hostname.ownershipVerifiedAt !== null,
    },
  };
}
