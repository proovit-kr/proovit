/*
  내 지표 — 시안 ver4 `#scr-mymetrics` 두 판(`.sb[data-pane]`)의 계산.

    ① mt-data   주간 방문·주간 가입·전환율 카드 셋, 최근 14일 2선 차트,
                유입 채널 상위 3
    ② mt-empty  측정 연동은 확인됐는데 아직 방문이 없다

  화면(app/dashboard/metrics)은 여기서 만든 값을 그릴 뿐이고, DB를 읽는 것은
  `dashboard-read.ts`의 `loadMyMetrics`다. 여기는 순수 함수라 테스트가 돈다.

  기간은 둘이다 — **카드·채널은 최근 7일, 차트는 최근 14일.** 시안이 카드를
  「주간」이라 부르고 차트를 「최근 14일」이라 부른다. 채널은 시안에 기간이
  없어 카드와 같은 주로 뒀다(내가 정함, 2026-09-23, 수연 확인 대기) — 「이번 주
  어디서 왔나」가 카드 옆에서 묻는 질문이다.

  ⚠️ 오늘은 뺀다. 집계는 하루 단위로 전일까지 닫히고(`metric_daily`), 오늘
  칸을 그리면 늘 낮아 보인다. 「어제까지 14일」이 차트, 「어제까지 7일」이 주간이다.

  ⚠️ 판은 **최근 14일에 집계 행이 있는가**다. 행이 하나도 없으면 ②, 있으면
  값이 0이어도 ①이다 — 행이 있다는 것은 엣지가 보고하고 있다는 뜻이고 그때
  「아직 방문이 없습니다」는 거짓이다.
*/

export type MetricsPane = "data" | "empty";

export type MetricRow = { date: Date; visitors: number; signups: number };
export type ChannelRow = { date: Date; channel: string; visitors: number };

export type MetricsPoint = { date: Date; visitors: number; signups: number };

export type MetricsView = {
  pane: MetricsPane;
  /** 어제까지 14일. 빈 날은 0으로 채운다 */
  series: MetricsPoint[];
  week: { visitors: number; signups: number; conversion: string };
  /** 최근 7일 유입 채널 상위 3. 비율은 채널 전체(direct 포함) 합에 대한 것 */
  channels: { name: string; pct: number }[];
};

export const CHART_DAYS = 14;
export const WEEK_DAYS = 7;
const DAY_MS = 86_400_000;

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
const key = (d: Date) => d.toISOString().slice(0, 10);

/** `today`는 서울 날짜의 UTC 자정(`seoulDateOnly`). 오늘은 창 밖이다 */
export function metricsWindow(today: Date) {
  return {
    chartFrom: addDays(today, -CHART_DAYS),
    weekFrom: addDays(today, -WEEK_DAYS),
    /** 배타 — `metricDate < to` */
    to: today,
  };
}

/** 「15.5%」. 방문이 없으면 「0%」 — 분모 없는 비율을 꾸미지 않는다 */
export function conversionText(visitors: number, signups: number): string {
  if (visitors <= 0) return "0%";
  return `${((signups / visitors) * 100).toFixed(1)}%`;
}

export function buildMetricsView(args: {
  rows: MetricRow[];
  channels: ChannelRow[];
  today: Date;
}): MetricsView {
  const { rows, channels, today } = args;
  const byDay = new Map(rows.map((r) => [key(r.date), r]));
  const series: MetricsPoint[] = Array.from({ length: CHART_DAYS }, (_, i) => {
    const date = addDays(today, i - CHART_DAYS);
    const row = byDay.get(key(date));
    return { date, visitors: row?.visitors ?? 0, signups: row?.signups ?? 0 };
  });
  const week = series.slice(CHART_DAYS - WEEK_DAYS);
  const visitors = week.reduce((s, p) => s + p.visitors, 0);
  const signups = week.reduce((s, p) => s + p.signups, 0);

  const { weekFrom, to } = metricsWindow(today);
  const sum = new Map<string, number>();
  for (const c of channels) {
    if (c.date < weekFrom || c.date >= to) continue;
    sum.set(c.channel, (sum.get(c.channel) ?? 0) + c.visitors);
  }
  const total = [...sum.values()].reduce((a, b) => a + b, 0);
  const top = [...sum.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([name, v]) => ({ name, pct: Math.round((v / total) * 100) }));

  return {
    pane: rows.length ? "data" : "empty",
    series,
    week: { visitors, signups, conversion: conversionText(visitors, signups) },
    channels: total > 0 ? top : [],
  };
}

/* ── 차트 ──────────────────────────────────────────────────────────────── */

/*
  시안의 svg 좌표계 그대로(viewBox 560×190). 왼쪽 눈금 글자 자리 34px, 위 14 ·
  아래 158이 값의 범위, 격자 넷은 최대·⅔·⅓·0, 날짜는 처음·가운데·끝 셋.
  가입은 「별도 스케일」 — 제 최댓값으로 따로 편다.
*/
export const CHART = {
  width: 560,
  height: 190,
  left: 34,
  right: 552,
  top: 14,
  bottom: 158,
  /** 눈금 글자의 오른끝(`text-anchor: end`) */
  tickX: 26,
  /** 날짜 글자의 y */
  dateY: 182,
} as const;

export type ChartModel = {
  ticks: { value: number; y: number }[];
  dates: { label: string; x: number; anchor: "start" | "end" }[];
  visitors: string;
  signups: string;
  /** 방문 선 아래 채움 */
  area: string;
};

/**
 * 셋으로 나눠 떨어지는 「깔끔한 최댓값」 — 3·{1, 2, 5}·10ⁿ 중 값 이상인 첫 것.
 * 격자가 넷(최대·⅔·⅓·0)이라 눈금이 정수가 되려면 3의 배수여야 한다.
 */
export function niceMax(value: number): number {
  if (value <= 3) return 3;
  const steps = [1, 2, 5];
  for (let exp = 0; exp < 12; exp += 1) {
    for (const s of steps) {
      const candidate = 3 * s * 10 ** exp;
      if (candidate >= value) return candidate;
    }
  }
  return value;
}

const MONTH_DAY = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "UTC",
  month: "2-digit",
  day: "2-digit",
});
/** 「10.12」 — `metric_date`는 날짜뿐이라 UTC 그대로 읽는다 */
export const monthDay = (d: Date) =>
  MONTH_DAY.format(d).replace(/\s/g, "").replace(/\.$/, "");

export function chartModel(series: MetricsPoint[]): ChartModel {
  const n = series.length;
  const span = CHART.bottom - CHART.top;
  const x = (i: number) =>
    Math.round(CHART.left + (i * (CHART.right - CHART.left)) / Math.max(1, n - 1));
  const y = (v: number, max: number) =>
    Number((CHART.bottom - (v / max) * span).toFixed(1));

  const vMax = niceMax(Math.max(...series.map((p) => p.visitors)));
  const sMax = niceMax(Math.max(...series.map((p) => p.signups)));

  const visitors = series.map((p, i) => `${x(i)},${y(p.visitors, vMax)}`);
  const signups = series.map((p, i) => `${x(i)},${y(p.signups, sMax)}`);

  const ticks = [3, 2, 1, 0].map((k) => ({
    value: (vMax / 3) * k,
    y: CHART.bottom - (span / 3) * k,
  }));
  const mid = Math.floor((n - 1) / 2);
  const dates =
    n === 0
      ? []
      : [
          { label: monthDay(series[0].date), x: x(0), anchor: "start" as const },
          { label: monthDay(series[mid].date), x: x(mid), anchor: "start" as const },
          { label: monthDay(series[n - 1].date), x: x(n - 1), anchor: "end" as const },
        ];

  return {
    ticks,
    dates,
    visitors: visitors.join(" "),
    signups: signups.join(" "),
    area: `${visitors.join(" ")} ${x(n - 1)},${CHART.bottom} ${x(0)},${CHART.bottom}`,
  };
}
