import { describe, expect, it } from "vitest";

import {
  buildMetricsView,
  chartModel,
  conversionText,
  metricsWindow,
  monthDay,
  niceMax,
} from "@/lib/metrics-view";

/* 서울 2026-10-26의 UTC 자정 — `seoulDateOnly`가 주는 꼴 */
const TODAY = new Date("2026-10-26T00:00:00Z");
const day = (back: number) => new Date(TODAY.getTime() - back * 86_400_000);

/* 개발 바 「내 지표 ①」이 심는 시안 목업 */
const VISITORS = [62, 70, 78, 74, 96, 108, 104, 128, 150, 144, 176, 188, 200, 218];
const SIGNUPS = [8, 10, 11, 10, 14, 17, 16, 20, 23, 22, 27, 29, 31, 35];
const rows = VISITORS.map((visitors, i) => ({
  date: day(14 - i),
  visitors,
  signups: SIGNUPS[i],
}));
const channels = VISITORS.flatMap((v, i) => {
  const date = day(14 - i);
  const tagged = [
    ["스레드", Math.round(v * 0.42)],
    ["카카오 오픈채팅", Math.round(v * 0.27)],
    ["인스타 릴스", Math.round(v * 0.18)],
  ] as const;
  const rest = v - tagged.reduce((s, [, n]) => s + n, 0);
  return [
    ...tagged.map(([channel, visitors]) => ({ date, channel, visitors })),
    { date, channel: "direct", visitors: rest },
  ];
});

describe("metricsWindow", () => {
  it("어제까지 14일·7일, 오늘은 배타", () => {
    const w = metricsWindow(TODAY);
    expect(w.to).toEqual(TODAY);
    expect(w.chartFrom).toEqual(day(14));
    expect(w.weekFrom).toEqual(day(7));
  });
});

describe("buildMetricsView", () => {
  it("시안 ① — 주간 1,204 · 187 · 15.5%, 채널 42·27·18", () => {
    const v = buildMetricsView({ rows, channels, today: TODAY });
    expect(v.pane).toBe("data");
    expect(v.series).toHaveLength(14);
    expect(v.series[0].date).toEqual(day(14));
    expect(v.series[13].date).toEqual(day(1));
    expect(v.week).toEqual({ visitors: 1204, signups: 187, conversion: "15.5%" });
    expect(v.channels).toEqual([
      { name: "스레드", pct: 42 },
      { name: "카카오 오픈채팅", pct: 27 },
      { name: "인스타 릴스", pct: 18 },
    ]);
  });

  it("행이 없으면 ② — 빈 날은 0으로 채운다", () => {
    const v = buildMetricsView({ rows: [], channels: [], today: TODAY });
    expect(v.pane).toBe("empty");
    expect(v.series.every((p) => p.visitors === 0 && p.signups === 0)).toBe(true);
    expect(v.week.conversion).toBe("0%");
    expect(v.channels).toEqual([]);
  });

  it("창 밖의 행·오늘 행은 안 센다", () => {
    const v = buildMetricsView({
      rows: [
        { date: day(15), visitors: 999, signups: 99 },
        { date: TODAY, visitors: 999, signups: 99 },
        { date: day(3), visitors: 10, signups: 1 },
      ],
      channels: [
        { date: day(8), channel: "옛것", visitors: 500 },
        { date: day(3), channel: "스레드", visitors: 10 },
      ],
      today: TODAY,
    });
    expect(v.week.visitors).toBe(10);
    expect(v.channels).toEqual([{ name: "스레드", pct: 100 }]);
  });
});

describe("chartModel", () => {
  it("시안 좌표계 — 격자 넷, 날짜 셋, 선 둘, 채움", () => {
    const v = buildMetricsView({ rows, channels, today: TODAY });
    const c = chartModel(v.series);
    expect(c.ticks.map((t) => t.value)).toEqual([300, 200, 100, 0]);
    expect(c.ticks.map((t) => t.y)).toEqual([14, 62, 110, 158]);
    expect(c.dates.map((d) => d.label)).toEqual(["10.12", "10.18", "10.25"]);
    expect(c.visitors.startsWith("34,")).toBe(true);
    expect(c.visitors.split(" ")).toHaveLength(14);
    expect(c.visitors.split(" ").at(-1)?.startsWith("552,")).toBe(true);
    expect(c.area.endsWith(" 552,158 34,158")).toBe(true);
    /* 가입은 제 최댓값(60)으로 따로 편다 — 마지막 점 35/60 */
    expect(c.signups.split(" ").at(-1)).toBe("552,74");
  });
});

describe("niceMax · conversionText · monthDay", () => {
  it("셋으로 나눠 떨어지는 최댓값", () => {
    expect(niceMax(0)).toBe(3);
    expect(niceMax(112)).toBe(150);
    expect(niceMax(218)).toBe(300);
    expect(niceMax(300)).toBe(300);
    expect(niceMax(1204)).toBe(1500);
  });
  it("전환율", () => {
    expect(conversionText(1204, 187)).toBe("15.5%");
    expect(conversionText(0, 0)).toBe("0%");
  });
  it("날짜", () => {
    expect(monthDay(new Date("2026-10-12T00:00:00Z"))).toBe("10.12");
    expect(monthDay(new Date("2026-09-28T00:00:00Z"))).toBe("09.28");
  });
});
