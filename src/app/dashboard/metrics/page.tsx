import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/EmptyState";
import { guardPage } from "@/lib/access";
import { loadMetrics } from "@/lib/dashboard-read";
import { loadHostnameStatus } from "@/lib/submission-store";

import styles from "./metrics.module.css";

/*
  내 지표 — PLN3 2장 「내 참가작의 지표」.

  읽기 전용이다. 값은 엣지가 집계해 `metric_daily`에 넣고(ADR-006 리버스 프록시),
  화면은 그것만 읽는다.

  ⚠️ 여기서 계산하는 것은 **합계뿐이다.** 순위·전환율·점수는 만들지 않는다 —
  채점식이 확정되지 않았고(PLN6 6장 1·2번), 순위의 정본은 `leaderboard_snapshots`다.
  화면이 자기 식으로 계산하면 리더보드와 다른 숫자가 나오고, 그게 곧 분쟁이 된다.

  ⚠️ 빈 상태가 정상이다. 배포 전에는 집계 자체가 없다(API v0.2 §10).
*/

export const metadata: Metadata = {
  title: "내 지표",
  robots: { index: false, follow: false },
};

const DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
});
const NUM = new Intl.NumberFormat("ko-KR");

export default async function Page() {
  const { viewer, access } = await guardPage(
    "dashboardMetrics",
    "/dashboard/metrics",
  );
  if (!viewer.entry) notFound();

  /* 진도 미달(minStage: s3)이면 409다. 그때는 조회하지 않는다 */
  const [metrics, hostname] = access.ok
    ? await Promise.all([
        loadMetrics(viewer.entry.id),
        loadHostnameStatus(viewer.entry.id),
      ])
    : [null, null];

  /*
    추세는 최근 14일만 본다. 30일을 다 그리면 막대가 손톱만 해져 모양이 안 읽히고,
    "이번 주에 늘었나"가 참가자가 이 화면에서 묻는 질문이다.
    daily는 최신순이라 뒤집어서 왼쪽이 과거가 되게 한다.
  */
  const trend = metrics ? [...metrics.daily].slice(0, 14).reverse() : [];
  const trendMax = trend.reduce((max, d) => Math.max(max, d.validVisitors), 0);
  const channelTotal =
    metrics?.channels.reduce((sum, c) => sum + c.visitors, 0) ?? 0;

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>내 지표</h1>
        <p className={styles.purpose}>
          측정 프록시가 하루 단위로 집계한 값입니다. 순위와 점수는 채점 기준이
          확정된 뒤 리더보드에서 함께 보여드립니다.
        </p>
        {!access.ok ? <p className={styles.locked}>{access.message}</p> : null}
      </header>

      {metrics && metrics.daily.length === 0 ? (
        <EmptyState
          title="아직 집계된 방문이 없습니다"
          detail={
            hostname?.verified
              ? "측정 주소는 확인됐습니다. 방문이 생기면 다음 날 집계부터 이 표에 쌓입니다."
              : "측정 주소의 소유 확인이 끝나야 집계가 시작됩니다."
          }
          action={
            hostname?.verified ? null : (
              <Link href="/dashboard/measurement" className={styles.link}>
                측정 연동 화면으로
              </Link>
            )
          }
        />
      ) : null}

      {metrics && metrics.daily.length > 0 ? (
        <>
          <dl className={styles.totals}>
            <div className={styles.total}>
              <dt>유효 방문</dt>
              <dd>{NUM.format(metrics.totals.validVisitors)}</dd>
            </div>
            <div className={styles.total}>
              <dt>가입</dt>
              <dd>{NUM.format(metrics.totals.signups)}</dd>
            </div>
            <div className={styles.total}>
              <dt>매출</dt>
              <dd>{NUM.format(Number(metrics.totals.revenue))}원</dd>
            </div>
          </dl>
          <p className={styles.note}>최근 30일 합계입니다.</p>

          {/*
            추세 띠. 표만 있으면 "늘고 있나"를 사람이 눈으로 세야 한다.
            막대 하나가 하루고, 높이는 그 기간 최댓값에 대한 비율이다 —
            절대 눈금을 그리지 않는 이유는 이 그림이 값이 아니라 **모양**을
            읽는 자리이기 때문이다. 정확한 값은 바로 아래 표에 있다.
          */}
          <section className={styles.trend}>
            <h2 className={styles.trendTitle}>최근 {trend.length}일 유효 방문</h2>
            <ol className={styles.bars}>
              {trend.map((day) => (
                <li key={day.date.toISOString()} className={styles.bar}>
                  <span
                    className={styles.barFill}
                    style={{
                      height: `${trendMax === 0 ? 0 : Math.round((day.validVisitors / trendMax) * 100)}%`,
                    }}
                  />
                  <span className={styles.barLabel}>
                    {DATE.format(day.date)} {NUM.format(day.validVisitors)}
                  </span>
                </li>
              ))}
            </ol>
            <p className={styles.note}>
              가장 높은 날 {NUM.format(trendMax)}회를 기준으로 그렸습니다.
            </p>
          </section>

          {/*
            유입 채널. 채널명은 참가자가 정한 UTM 값을 그대로 쓴다 —
            우리가 아는 이름으로 묶으면 그 순간 집계가 우리 해석이 된다.
          */}
          {metrics.channels.length > 0 ? (
            <section className={styles.channels}>
              <h2 className={styles.trendTitle}>유입 채널</h2>
              <ol className={styles.channelList}>
                {metrics.channels.slice(0, 5).map((row) => (
                  <li key={row.channel} className={styles.channel}>
                    <span className={styles.channelName}>{row.channel}</span>
                    <span className={styles.channelTrack}>
                      <i
                        style={{
                          width: `${channelTotal === 0 ? 0 : Math.round((row.visitors / channelTotal) * 100)}%`,
                        }}
                      />
                    </span>
                    <span className={styles.channelPct}>
                      {channelTotal === 0
                        ? "—"
                        : `${Math.round((row.visitors / channelTotal) * 100)}%`}
                    </span>
                  </li>
                ))}
              </ol>
              <p className={styles.note}>
                채널이 붙지 않은 방문은 집계에 잡히지만 이 목록에는 안 나옵니다.
                합계는 위 유효 방문과 다를 수 있습니다.
              </p>
            </section>
          ) : null}

          {/* 표는 좁은 화면에서 가로로 넘긴다 — 숫자를 줄바꿈하면 자릿수가 깨진다 */}
          <div className={styles.scroller}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">날짜</th>
                  <th scope="col">유효 방문</th>
                  <th scope="col">가입</th>
                  <th scope="col">매출</th>
                  <th scope="col">출처</th>
                </tr>
              </thead>
              <tbody>
                {metrics.daily.map((row) => (
                  <tr key={row.date.toISOString()}>
                    <th scope="row">{DATE.format(row.date)}</th>
                    <td>{NUM.format(row.validVisitors)}</td>
                    <td>{NUM.format(row.signups)}</td>
                    <td>{NUM.format(Number(row.revenue))}</td>
                    <td className={styles.source}>
                      {row.source === "manual" ? "운영자 보정" : "자동 집계"}
                      {/* 검수에 걸린 날은 숨기지 않는다 — 조정 사실을 아는 것이 참가자 권리다 */}
                      {row.flagged ? <span className={styles.flag}>검수</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {metrics?.hasExtra ? (
        <p className={styles.note}>
          참고 지표도 쌓이고 있습니다. 무엇을 어떻게 셀지가 정해지면 여기에
          함께 보여드립니다.
        </p>
      ) : null}
    </section>
  );
}
