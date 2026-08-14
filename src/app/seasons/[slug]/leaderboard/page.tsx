import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/EmptyState";
import { Footer } from "@/components/Footer";
import { NavBar } from "@/components/NavBar";
import { guardPage } from "@/lib/access";
import { loadLeaderboard, loadPublicSeason } from "@/lib/public-read";
import { getCurrentSeason, resolveNavCta } from "@/lib/season";

import styles from "./leaderboard.module.css";

/*
  리더보드 — PLN3 2장 「서비스의 얼굴이자 관전 통로」.

  화면이 세 상태다.
    ① 레이스 전       → 잠김. 열리는 시점을 말한다(canAccess가 409를 준다)
    ② 레이스 중·집계 전 → 참가팀 목록만. 순위 자리를 비운다
    ③ 집계 후          → 스냅샷 순위

  ⚠️ **순위를 이 화면에서 계산하지 않는다.** 정본은 `leaderboard_snapshots`이고
  산식이 미확정이다. 임의 정렬로 채우면 그게 곧 "우리가 매긴 순위"가 되고,
  우리가 파는 「조작 불가능한 지표」의 반례가 된다(CLAUDE.md 규칙 1).

  ⚠️ 공개 범위는 팀명·참가작 명칭·URL·지표까지다(동의 문안 A 「공개 범위 안내」).
  참가자 이름은 어디에도 넣지 않는다.
*/

export const metadata: Metadata = {
  title: "리더보드",
};

const DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});
const NUM = new Intl.NumberFormat("ko-KR");

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { access } = await guardPage(
    "leaderboard",
    `/seasons/${slug}/leaderboard`,
  );

  const season = await loadPublicSeason(slug);
  if (!season) notFound();

  /* 잠김(레이스 전)은 404가 아니다 — 언제 열리는지 말해야 관전자가 다시 온다 */
  const board = access.ok ? await loadLeaderboard(season.id) : null;
  const current = await getCurrentSeason();
  const ranked = board?.rows.some((row) => row.rank !== null) ?? false;

  return (
    <main className={`page ${styles.page}`}>
      <NavBar cta={current ? resolveNavCta(current) : { href: "/", label: "홈" }} />
      <div className={`container grow ${styles.wrap}`}>
        <header className={styles.head}>
          <p className={styles.season}>
            <Link href={`/seasons/${season.slug}`} className={styles.seasonLink}>
              {season.title}
            </Link>
          </p>
          <h1 className={styles.title}>리더보드</h1>
          <p className={styles.lead}>
            발표가 아니라 실제 이용자 지표로 겨룹니다. 숫자는 참가작에 붙은 측정
            프록시가 직접 집계합니다.
          </p>
          {board?.snapshotDate ? (
            <p className={styles.asOf}>
              {DATE.format(board.snapshotDate)} 집계 기준입니다.
            </p>
          ) : null}
        </header>

        {!access.ok ? (
          <EmptyState
            title="아직 순위가 열리지 않았습니다"
            detail="시즌이 시작되고 참가팀이 서비스를 배포하면 이 자리에 순위가 올라옵니다."
            action={
              <Link href={`/seasons/${season.slug}`} className={styles.link}>
                시즌 일정 보기
              </Link>
            }
          />
        ) : null}

        {board && board.rows.length === 0 ? (
          <EmptyState
            title="아직 참가팀이 없습니다"
            detail="참가 신청이 접수되면 이 자리에 팀이 올라옵니다."
          />
        ) : null}

        {board && board.rows.length > 0 && !ranked ? (
          <p className={styles.note}>
            아직 집계된 순위가 없습니다. 참가팀이 서비스를 배포하고 방문이
            쌓이면 순위가 매겨집니다.
          </p>
        ) : null}

        {board && board.rows.length > 0 ? (
          <div className={styles.scroller}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col" className={styles.rankCol}>
                    순위
                  </th>
                  <th scope="col">팀 · 참가작</th>
                  <th scope="col">유효 방문</th>
                  <th scope="col">매출</th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map((row) => (
                  <tr key={row.entryId}>
                    <td className={styles.rank}>
                      {row.rank ?? <span className={styles.dash}>—</span>}
                    </td>
                    <th scope="row" className={styles.entry}>
                      <Link
                        href={`/projects/${row.entryId}`}
                        className={styles.entryLink}
                      >
                        {row.ideaTitle}
                      </Link>
                      <span className={styles.team}>{row.teamName}</span>
                      {/*
                        미배포는 숨기지 않는다 — 지표가 0인 이유를 밝히는 것이
                        0을 그냥 보여주는 것보다 정확하다(PLN3 2장).
                      */}
                      {row.notDeployed ? (
                        <span className={styles.flag}>미배포</span>
                      ) : null}
                      {row.awardIneligible ? (
                        <span className={styles.flag}>시상 제외</span>
                      ) : null}
                    </th>
                    <td>{NUM.format(row.validVisitors)}</td>
                    <td>{NUM.format(Number(row.revenue))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <p className={styles.footnote}>
          지표는 하루 단위로 집계하며 실시간이 아닙니다. 어뷰징으로 확인된 방문은
          집계에서 제외되고, 실격·자진 포기한 팀은 순위에서 빠집니다.
        </p>
      </div>
      <Footer />
    </main>
  );
}
