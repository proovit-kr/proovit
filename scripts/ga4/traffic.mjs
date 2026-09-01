/*
  GA4 트래픽 요약.

    node --env-file=.env.local scripts/ga4/traffic.mjs           # 최근 28일
    node --env-file=.env.local scripts/ga4/traffic.mjs --days 7
    node --env-file=.env.local scripts/ga4/traffic.mjs --since 2026-08-01 --until 2026-08-31

  맨 위 숫자가 **일별 활성 사용자의 합**인 이유는 09 심사 기준서가 유효
  방문자를 그렇게 고정했기 때문이다(src/app/layout.tsx의 gaId 주석 참조).
  기간 전체의 순 사용자수(unique)와는 다른 값이며, 더 크다 — 같은 사람이
  이틀 오면 2로 센다. 심사에 낼 숫자는 이쪽이므로 이걸 기본으로 둔다.
*/
import { runReport, rows, table } from "./api.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const days = Number(arg("days", 28));
const since = arg("since", `${days}daysAgo`);
const until = arg("until", "today");
const range = [{ startDate: since, endDate: until }];

const daily = rows(
  await runReport({
    dateRanges: range,
    dimensions: [{ name: "date" }],
    metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }, { name: "sessions" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  }),
);

const sum = (key) => daily.reduce((a, r) => a + r[key], 0);
const ymd = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

console.log(`\n기간: ${since} → ${until}`);
console.log(`일별 활성 사용자 합: ${sum("activeUsers").toLocaleString()}  ← 심사 기준 유효 방문자`);
console.log(`페이지뷰: ${sum("screenPageViews").toLocaleString()}    세션: ${sum("sessions").toLocaleString()}`);

table(
  "일별",
  daily.map((r) => ({ ...r, date: ymd(r.date) })),
  [
    { key: "date", label: "날짜" },
    { key: "activeUsers", label: "활성 사용자", right: true },
    { key: "screenPageViews", label: "페이지뷰", right: true },
    { key: "sessions", label: "세션", right: true },
  ],
);

table(
  "경로별",
  rows(
    await runReport({
      dateRanges: range,
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 20,
    }),
  ),
  [
    { key: "pagePath", label: "경로" },
    { key: "screenPageViews", label: "페이지뷰", right: true },
    { key: "activeUsers", label: "활성 사용자", right: true },
  ],
);

table(
  "유입원",
  rows(
    await runReport({
      dateRanges: range,
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [{ name: "sessions" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 20,
    }),
  ),
  [
    { key: "sessionSource", label: "소스" },
    { key: "sessionMedium", label: "매체" },
    { key: "sessions", label: "세션", right: true },
    { key: "activeUsers", label: "활성 사용자", right: true },
  ],
);
