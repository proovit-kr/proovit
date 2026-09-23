import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { LinkButton } from "@/components/Button";
import { ClauseFit } from "@/components/ClauseFit";
import { Clauses } from "@/components/Clauses";
import { Icon } from "@/components/Icon";
import { PageToast } from "@/components/PageToast";
import { Card } from "@/components/Surface";
import {
  METRICS_CARD,
  METRICS_CHANNELS,
  METRICS_CHART,
  METRICS_EMPTY,
  METRICS_HEAD,
  METRICS_UNVERIFIED,
} from "@/content/metrics";
import { guardPage } from "@/lib/access";
import { loadMyMetrics, type MyMetrics } from "@/lib/dashboard-read";
import { devNow } from "@/lib/dev-clock";
import { CHART, chartModel } from "@/lib/metrics-view";

import hub from "../hub.module.css";

import { CopyLinkButton } from "./MetricsActions";

import styles from "./metrics.module.css";

/*
  내 지표 — 시안 ver4 `#scr-mymetrics` 두 판(`.sb[data-pane]`).

    ① mt-data   카드 셋(주간 방문·주간 가입·전환율) · 최근 14일 2선 차트 ·
                유입 채널 상위 3
    ② mt-empty  「측정 연동 확인됨 ✓」 배지 + 빈 판(홍보 링크 복사)

  판은 데이터의 결과다 — 어제까지 14일에 집계 행이 있으면 ①, 없으면 ②
  (`metrics-view.ts`). 개발 바의 「내 지표」 줄이 두 판을 심는다
  (`dev-sandbox.ts` `setSandboxMyMetrics`).

  값은 `node scripts/design-diff/fold-spec.mjs --media '^\.(ch|bar-row|lb-empty)'`의
  최종 승자를 `metrics.module.css`가 그대로 든다. 카드 셋은 허브와 같은
  `.hb-cards`라 `hub.module.css`의 `.cards`·`.kpi`를 쓴다. 대조는
  `scripts/design-diff/metrics.mjs`.

  시안과 일부러 다른 것(내가 정함, 2026-09-23, 수연 확인 대기):
    · 측정 연동이 안 끝난 팀의 빈 판. 시안 ②는 「연동은 확인됐어요」라 그대로
      보이면 거짓이다 — 배지·문장·버튼만 갈라 측정 연동 화면으로 보낸다.
    · 「홍보 링크 복사」는 팀 주소(`https://팀명.proovit.kr`)를 복사한다.
    · 유입 채널의 기간은 카드와 같은 최근 7일(시안에 기간이 없다).
  옛 화면의 일별 표·매출 합계는 시안에 없어 지웠다.
*/

export const metadata: Metadata = {
  title: "내 지표",
  robots: { index: false, follow: false },
};

const NUM = new Intl.NumberFormat("ko-KR");

export default async function Page() {
  const { viewer, access } = await guardPage(
    "dashboardMetrics",
    "/dashboard/metrics",
  );
  if (!viewer.entry) notFound();

  const view = access.ok ? await loadMyMetrics(viewer.entry.id, devNow()) : null;

  return (
    <PageToast>
      <div data-probe="metrics" data-state={view?.pane ?? "none"}>
        {!access.ok ? (
          <div className={`${hub.wbar} ${hub.wbarWarn}`} role="status">
            <Icon name="warn" fixed />
            <span>
              <Clauses text={access.message} />
            </span>
          </div>
        ) : null}

        <h2 className={hub.h1}>{METRICS_HEAD.title}</h2>
        <p className={hub.sub}>
          <Clauses text={METRICS_HEAD.sub} />
        </p>

        {view?.pane === "data" ? <Data view={view} /> : null}
        {view?.pane === "empty" ? <EmptyPane view={view} /> : null}
        <ClauseFit />
      </div>
    </PageToast>
  );
}

/** ① — 시안 `.pane[data-id="mt-data"]` */
function Data({ view }: { view: MyMetrics }) {
  const chart = chartModel(view.series);
  return (
    <>
      <div className={hub.cards}>
        <Card className={hub.kpi}>
          <small>{METRICS_CARD.visitors}</small>
          <span className="score" style={{ color: "var(--blue)" }}>
            {NUM.format(view.week.visitors)}
          </span>
        </Card>
        <Card className={hub.kpi}>
          <small>{METRICS_CARD.signups}</small>
          <span className="score">{NUM.format(view.week.signups)}</span>
        </Card>
        <Card className={hub.kpi}>
          <small>{METRICS_CARD.conversion}</small>
          <span className="score">{view.week.conversion}</span>
        </Card>
      </div>

      <div className={styles.ch}>
        <div className={styles.chHd}>
          <b>{METRICS_CHART.title}</b>
          <span className={styles.lg}>
            <i style={{ background: "var(--blue)" }} />
            {METRICS_CHART.visitors}
          </span>
          <span className={styles.lg}>
            <i style={{ background: "var(--accent)" }} />
            {METRICS_CHART.signups}
          </span>
        </div>
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={METRICS_CHART.title}
        >
          {chart.ticks.map((t) => (
            <line
              key={t.y}
              className={styles.grid}
              x1={CHART.left}
              y1={t.y}
              x2={CHART.right}
              y2={t.y}
            />
          ))}
          {chart.ticks.map((t) => (
            <text key={t.y} x={CHART.tickX} y={t.y + 3} textAnchor="end">
              {NUM.format(t.value)}
            </text>
          ))}
          {chart.dates.map((d) => (
            <text key={d.label + d.x} x={d.x} y={CHART.dateY} textAnchor={d.anchor}>
              {d.label}
            </text>
          ))}
          <polygon points={chart.area} fill="rgba(111,179,255,.09)" />
          <polyline
            points={chart.visitors}
            fill="none"
            stroke="var(--blue)"
            strokeWidth="2.5"
          />
          <polyline
            points={chart.signups}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
          />
        </svg>
      </div>

      <Card style={{ padding: "18px 22px" }}>
        <b style={{ fontSize: "14px" }}>{METRICS_CHANNELS.title}</b>
        {view.channels.map((c) => (
          <div key={c.name} className={styles.barRow}>
            <span className={styles.nm}>{c.name}</span>
            <span className={styles.tr}>
              <i style={{ width: `${c.pct}%` }} />
            </span>
            <span className={styles.pc}>{c.pct}%</span>
          </div>
        ))}
      </Card>
    </>
  );
}

/** ② — 시안 `.pane[data-id="mt-empty"]`. 연동 전이면 문구·버튼만 갈린다 */
function EmptyPane({ view }: { view: MyMetrics }) {
  const verified = view.hostname.verified && view.hostname.hostname;
  return (
    <>
      <Badge tone={verified ? "teal" : "gray"} style={{ marginBottom: "14px" }}>
        {verified ? METRICS_EMPTY.badge : METRICS_UNVERIFIED.badge}
      </Badge>
      <div className={styles.empty} style={{ marginTop: "10px" }}>
        <div className={styles.big}>{METRICS_EMPTY.big}</div>
        <p>
          <Clauses text={verified ? METRICS_EMPTY.body : METRICS_UNVERIFIED.body} />
        </p>
        {verified ? (
          <CopyLinkButton value={`https://${view.hostname.hostname}`} />
        ) : (
          <LinkButton href="/dashboard/measurement" style={{ marginTop: "18px" }}>
            {METRICS_UNVERIFIED.button}
          </LinkButton>
        )}
      </div>
    </>
  );
}
