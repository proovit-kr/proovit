import type { Metadata } from "next";

import { guardPage } from "@/lib/access";
import { loadRollupState, ROLLUP_EVERY_MIN, ROLLUP_LATE_MIN } from "@/lib/admin-read";
import { fmtMD } from "@/lib/header-state";
import { prisma } from "@/lib/prisma";
import { rollupHealth, type RollupHealth } from "@/lib/race";

import hub from "../../dashboard/hub.module.css";
import c from "../console.module.css";
import { ReviewActions } from "./ReviewActions";
import { channelHhi, flagReasons } from "./rules";

/*
  지표 검토 — PLN3 2장, 시안 ver4 `#scr-adm-metrics`.

  ⚠️ **전 팀 수동 검증이 아니다.** 자동 집계를 믿고, 규칙에 걸린 날만 사람이 본다.
  무엇이 걸리는지는 rules.ts가 정한다 — 화면과 규칙을 한 파일에 두면 기준을
  조정할 때 마크업을 헤집게 된다.

  ⚠️ 시안은 상태 토글(① 큐 3건 / ② 빈 상태)로 둘을 보여주지만 여기서는 **실제
  데이터로 갈린다.** 걸린 줄이 없으면 빈 상태다. 빈 상태의 「다음 롤업 n분 후」는
  마지막 롤업에서 주기(15분)로 센다. 롤업 상태는 대시보드 부제와 같은 판정
  (race.ts `rollupHealth`)을 따른다 — 롤업이 쉬는 동안에는 적지 않고, 멈췄으면
  「정상」 대신 「지연」이라 쓴다.

  ⚠️ 조회를 admin-read.ts로 올리지 않았다. 이 규칙은 이 화면에서만 쓰고,
  올리는 순간 다른 화면이 같은 이름으로 다른 기준을 기대하게 된다.
*/

export const metadata: Metadata = {
  title: "지표 검토",
  robots: { index: false, follow: false },
};

const NUM = new Intl.NumberFormat("ko-KR");

/**
 * 후보를 넉넉히 긁어 와 규칙은 JS에서 건다.
 *
 * 무효율은 두 칸(valid/sessions)의 비교라 Prisma `where`로 표현되지 않는다.
 * 한 시즌이 12~40팀 × 5주라 후보가 많아야 수백 줄이고, 그 정도는 여기서 거른다.
 */
const CANDIDATE_TAKE = 500;

/*
  빈 상태의 롤업 줄. 「정상 작동 중」만 시안 문구이고, 나머지는 시안에 없다 —
  내가 정함(수연 확인 대기). 롤업이 쉬면(idle) 줄을 뺀다 — 대시보드 부제와 같다.
*/
function rollupLine(health: RollupHealth): string | null {
  if (health.kind === "idle") return null;
  if (health.kind === "first") {
    return health.late ? "자동 집계 지연, 첫 롤업 없음." : "첫 롤업 대기.";
  }
  if (health.late) return `자동 집계 지연, 마지막 롤업 ${health.minutes}분 전.`;
  const next = Math.max(0, ROLLUP_EVERY_MIN - (health.minutes % ROLLUP_EVERY_MIN));
  return `자동 집계 정상 작동 중, 다음 롤업 ${next}분 후.`;
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
  const rollup = seasonId ? await loadRollupState(seasonId) : null;
  const line = rollup
    ? rollupLine(
        rollupHealth({ ...rollup, now: new Date(), lateMinutes: ROLLUP_LATE_MIN }),
      )
    : null;

  return (
    <>
      <h2 className={hub.h1}>지표 검토</h2>
      <p className={hub.sub}>플래그된 건만 검토, 전 팀 수동 검증 아님</p>

      {queue.length === 0 ? (
        /* 시안 ② — 리더보드 빈 상태와 같은 상자(`.lb-empty`) */
        <div className={c.lbEmpty} data-probe="metrics-empty" data-state="empty">
          <div className={c.big}>검토할 플래그 없음</div>
          {line && <p>{line}</p>}
        </div>
      ) : (
        <table className={c.atbl} data-probe="metrics" data-state="q">
          <thead>
            <tr>
              <th>TEAM</th>
              <th>플래그 사유</th>
              <th>원시 → 보정</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {queue.map((row) => (
              <tr key={row.id}>
                <td>
                  <b>{row.entry.team.name}</b>
                </td>
                {/*
                  큐는 팀·하루 한 줄이라 날짜를 사유 앞에 붙인다 — 한 팀이 이틀 걸리면
                  같은 팀명이 두 줄 선다(내가 정함, 시안은 팀명만).
                */}
                <td>
                  {fmtMD(row.metricDate)}, {row.reasons.join(", ")}
                </td>
                <td className={c.num}>
                  {NUM.format(row.rawVisitors)} → <b>{NUM.format(row.validVisitors)}</b>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <ReviewActions rowId={row.id} teamName={row.entry.team.name} rawVisitors={row.rawVisitors} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
