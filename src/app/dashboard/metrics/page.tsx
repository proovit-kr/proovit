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
