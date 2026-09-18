import type { Metadata } from "next";

import { EmptyState } from "@/components/EmptyState";
import { guardPage } from "@/lib/access";
import { prisma } from "@/lib/prisma";

import { ReviewActions } from "./ReviewActions";
import { channelHhi, flagReasons } from "./rules";

import styles from "./metrics.module.css";

/*
  지표 검토 — PLN3 2장, 시안 ver4 `#scr-adm-metrics`.

  ⚠️ **전 팀 수동 검증이 아니다.** 자동 집계를 믿고, 규칙에 걸린 날만 사람이 본다.
  무엇이 걸리는지는 rules.ts가 정한다 — 화면과 규칙을 한 파일에 두면 기준을
  조정할 때 마크업을 헤집게 된다.

  ⚠️ 시안은 상태 토글(① 큐 3건 / ② 빈 상태)로 둘을 보여주지만 여기서는 **실제
  데이터로 갈린다.** 걸린 줄이 없으면 빈 상태다. 운영 화면에 가짜 예시를 두면
  "지금 처리할 일이 있는가"를 화면이 대신 답해 주지 못한다.

  ⚠️ 조회를 admin-read.ts로 올리지 않았다. 이 규칙은 이 화면에서만 쓰고,
  올리는 순간 다른 화면이 같은 이름으로 다른 기준을 기대하게 된다.
*/

export const metadata: Metadata = {
  title: "지표 검토",
  robots: { index: false, follow: false },
};

const DAY = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
});

const NUM = new Intl.NumberFormat("ko-KR");

/**
 * 후보를 넉넉히 긁어 와 규칙은 JS에서 건다.
 *
 * 무효율은 두 칸(valid/sessions)의 비교라 Prisma `where`로 표현되지 않는다.
 * 한 시즌이 12~40팀 × 5주라 후보가 많아야 수백 줄이고, 그 정도는 여기서 거른다.
 */
const CANDIDATE_TAKE = 500;

/** 사람이 볼 때 「방금」인지 아닌지가 판단 재료다 */
function minutesAgo(at: Date): number {
  return Math.max(0, Math.round((Date.now() - at.getTime()) / 60_000));
}

export default async function Page() {
  const { viewer } = await guardPage("adminMetrics", "/admin/metrics");
  const seasonId = viewer.season?.id ?? null;

  const candidates = seasonId
    ? await prisma.metricDaily.findMany({
        where: {
          entry: { seasonId },
          /* 이미 누가 본 줄은 큐에서 내려간다 */
          reviewedBy: null,
          OR: [
            { spikeTrimmed: { gt: 0 } },
            { botFiltered: { gt: 0 } },
            { sessions: { gt: 0 } },
          ],
        },
        orderBy: [{ metricDate: "desc" }],
        take: CANDIDATE_TAKE,
        select: {
          id: true,
          entryId: true,
          metricDate: true,
          rawVisitors: true,
          validVisitors: true,
          sessions: true,
          botFiltered: true,
          spikeTrimmed: true,
          entry: {
            select: {
              id: true,
              ideaTitle: true,
              team: { select: { name: true } },
            },
          },
        },
      })
    : [];

  /*
    채널 집중도는 날짜별 합계 한 줄로 복원되지 않아 원자료를 따로 읽는다
    (스키마 metric_channel_daily 주석). 후보에 오른 팀·날짜만 읽는다.
  */
  const channels =
    candidates.length > 0
      ? await prisma.metricChannelDaily.findMany({
          where: {
            entryId: { in: [...new Set(candidates.map((row) => row.entryId))] },
            metricDate: {
              in: [
                ...new Map(
                  candidates.map((row) => [row.metricDate.getTime(), row.metricDate]),
                ).values(),
              ],
            },
          },
          select: { entryId: true, metricDate: true, visitors: true },
        })
      : [];

  const byKey = new Map<string, number[]>();
  for (const row of channels) {
    const key = `${row.entryId}|${row.metricDate.getTime()}`;
    byKey.set(key, [...(byKey.get(key) ?? []), row.visitors]);
  }

  const queue = candidates
    .map((row) => {
      const hhi = channelHhi(
        byKey.get(`${row.entryId}|${row.metricDate.getTime()}`) ?? [],
      );
      return {
        ...row,
        reasons: flagReasons({
          rawVisitors: row.rawVisitors,
          validVisitors: row.validVisitors,
          sessions: row.sessions,
          botFiltered: row.botFiltered,
          spikeTrimmed: row.spikeTrimmed,
          channelHhi: hhi,
        }),
      };
    })
    .filter((row) => row.reasons.length > 0);

  /*
    빈 상태에서 「집계가 멈춘 것」과 「걸린 게 없는 것」을 가른다. 시안이 빈
    상태에 롤업 시각을 적는 이유가 이것이다 — 둘을 못 가르면 파이프라인이
    죽은 것을 「평온함」으로 읽는다.
  */
  const lastRollup = seasonId
    ? (
        await prisma.metricDaily.aggregate({
          where: { entry: { seasonId } },
          _max: { batchAt: true },
        })
      )._max.batchAt
    : null;

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>지표 검토</h1>
        <p className={styles.sub}>
          플래그된 건만 검토합니다. 전 팀을 손으로 확인하지 않습니다. 확정·재계산·이관
          모두 사유가 남고 감사 로그에 기록됩니다.
        </p>
      </header>

      {queue.length === 0 ? (
        <EmptyState
          title="검토할 플래그가 없습니다"
          detail={
            lastRollup
              ? `자동 집계 정상 작동 중입니다. 마지막 롤업 ${minutesAgo(lastRollup)}분 전.`
              : "아직 집계가 들어오지 않았습니다. 측정이 붙고 롤업이 돌면 걸린 건만 여기에 쌓입니다."
          }
        />
      ) : (
        <div className={styles.scroller}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">팀</th>
                <th scope="col">플래그 사유</th>
                <th scope="col">원시 → 보정</th>
                <th scope="col">
                  <span className={styles.srOnly}>판정</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className={styles.team}>
                    {row.entry.team.name}
                    <span className={styles.when}>{DAY.format(row.metricDate)}</span>
                  </th>
                  <td>
                    <ul className={styles.reasons}>
                      {row.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </td>
                  <td className={styles.numbers}>
                    {NUM.format(row.rawVisitors)}
                    <span className={styles.arrow}> → </span>
                    <b>{NUM.format(row.validVisitors)}</b>
                  </td>
                  <td>
                    <ReviewActions rowId={row.id} rawVisitors={row.rawVisitors} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
