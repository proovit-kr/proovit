import type { Metadata } from "next";

import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { guardPage } from "@/lib/access";

import { loadAwardBoard } from "./awards-read";
import { FinalizeButton } from "./FinalizeButton";

import styles from "./awards.module.css";

/*
  시상 — PLN3 화면정의서 2장 「최종 순위를 확정하고 수상을 발표한다」.

  ⚠️ **화면이 순위를 만들지 않는다.** 표에 보이는 순위는 롤업이 쓴
  `leaderboard_snapshots`를 그대로 읽은 것이고(awards-read.ts), 이 화면이 하는
  일은 그 값을 **확정**하는 것 하나다. 확정하면 공개 리더보드가 FINAL로 바뀐다.

  ⚠️ 상태가 둘이다. 데이터가 가른다 — 토글이 아니다.
    ① 드래프트  스냅샷의 `isFinal`이 전부 false. 확정 버튼이 열려 있고
                「수상」 칸은 순위로 계산한 **제안값**이다.
    ② 확정 완료  `isFinal`이 true. 확정 버튼 자리에 확정 시각이 오고
                「수상」 칸은 `awards` 표에 기록된 값이다.
  그리고 롤업이 한 번도 안 돌았으면 빈 상태다.

  ⚠️ 제재로 빠진 팀을 목록에서 지우지 않는다. 취소선으로 남기고 제재 사유를
  같이 적는다 — 확정 버튼을 누르기 전에 「왜 빠졌는지」가 같은 화면에 있어야 한다.
*/

export const metadata: Metadata = {
  title: "시상",
  robots: { index: false, follow: false },
};

const WHEN = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DAY = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
});

/** 스냅샷의 score는 Decimal 문자열이다. 천 단위만 끊어 보여준다 */
function score(value: string): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return num.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

export default async function Page() {
  const { viewer } = await guardPage("adminAwards", "/admin/awards");
  const board = viewer.season
    ? await loadAwardBoard(viewer.season.id)
    : { snapshotDate: null, isFinal: false, finalizedAt: null, rows: [] };

  /* 확인 모달이 다시 보여줄 수상 대상 */
  const winners = board.rows
    .filter((row) => row.award !== null && row.rank !== null)
    .map((row) => ({
      rank: row.rank as number,
      teamName: row.teamName,
      award: row.award as string,
    }));

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>시상</h1>
        <p className={styles.sub}>
          롤업이 집계한 순위를 확정하고 수상을 기록합니다. 순위는 이 화면에서
          다시 계산하지 않습니다 — 공개 리더보드와 같은 값을 읽습니다.
        </p>
      </header>

      {/* 시즌1의 전제. 표보다 위에 둔다 */}
      <p className={styles.warnBar}>
        시즌1은 상금 지급 없음. 순위와 시상 발표까지입니다.
      </p>

      {board.rows.length === 0 ? (
        <EmptyState
          title="확정할 집계가 없습니다"
          detail="롤업이 순위를 한 번이라도 집계하면 여기에 표가 생깁니다. 시즌이 진행 중이면 다음 롤업을 기다려 주세요."
        />
      ) : (
        <>
          <div className={styles.bar}>
            {board.isFinal ? (
              <span className={`${styles.chip} ${styles.chipFinal}`}>
                FINAL 확정 완료
                {board.finalizedAt ? ` · ${WHEN.format(board.finalizedAt)}` : ""}
              </span>
            ) : (
              <span className={styles.chip}>드래프트(확정 전)</span>
            )}

            {board.snapshotDate ? (
              <span className={styles.chip}>
                집계일 {DAY.format(board.snapshotDate)}
              </span>
            ) : null}

            {/* 확정된 시즌에는 버튼을 아예 주지 않는다. 비활성 버튼은 「누르면 될 것 같다」를 남긴다 */}
            {board.isFinal || !viewer.season ? null : (
              <FinalizeButton seasonId={viewer.season.id} winners={winners} />
            )}
          </div>

          <div className={styles.scroller}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">RANK</th>
                  <th scope="col">TEAM</th>
                  <th scope="col">최종 지표</th>
                  <th scope="col">제재 반영</th>
                  <th scope="col">수상</th>
                  <th scope="col">보증금 정산</th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map((row) => (
                  <tr
                    key={row.entryId}
                    className={row.struck ? styles.struck : undefined}
                  >
                    <td className={styles.rank}>
                      {row.rank === null
                        ? "-"
                        : String(row.rank).padStart(2, "0")}
                    </td>
                    <th scope="row" className={styles.team}>
                      {row.teamName}
                      <small>{row.ideaTitle}</small>
                    </th>
                    <td className={styles.score}>{score(row.score)}</td>
                    <td>
                      {row.sanction ? (
                        <>
                          <Badge tone="warn">{row.sanction.label}</Badge>
                          <span className={styles.detail}>
                            {row.sanction.detail}
                          </span>
                        </>
                      ) : row.ineligible ? (
                        <>
                          <Badge tone="gray" dashed>
                            시상 제외
                          </Badge>
                          <span className={styles.detail}>
                            축 하한 미달. 순위표에는 남고 종합 시상에서만
                            빠집니다.
                          </span>
                        </>
                      ) : (
                        <span className={styles.none}>-</span>
                      )}
                    </td>
                    <td>
                      {row.award ? (
                        <Badge tone="lime">{row.award}</Badge>
                      ) : (
                        <span className={styles.none}>-</span>
                      )}
                    </td>
                    {/* 보증금은 도입 미정이다. 빈칸으로 두면 「아직 안 넣었나」가 된다 */}
                    <td className={styles.deposit}>- 도입 미정</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={styles.foot}>
            {board.isFinal
              ? "확정된 순위입니다. 공개 리더보드가 FINAL로 전환되었고 되돌릴 수 없습니다. 정정이 필요하면 이의신청 절차를 따릅니다."
              : "확정 시 공개 리더보드가 FINAL로 전환되며 되돌릴 수 없습니다. 제재 반영이 끝났는지 먼저 확인해 주세요."}
          </p>
        </>
      )}
    </section>
  );
}
