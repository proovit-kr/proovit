import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { Sparkline } from "@/components/Sparkline";
import { JourneyTrack } from "@/components/StageProgress";
import { AnchorButton } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { NavBar } from "@/components/NavBar";
import { SEASON_STAGES } from "@/content/landing";
import { guardPage } from "@/lib/access";
import { loadPublicEntry } from "@/lib/public-read";
import { getCurrentSeason, resolveNav } from "@/lib/season";

import styles from "./project.module.css";

/*
  참가작 상세 — PLN3 2장 「참가자가 공유하는 링크의 목적지」.

  ⚠️ 공개하는 것은 **팀명·참가작 명칭·소개·URL·지표**까지다. 동의 문안 A의
  「공개 범위 안내」가 그렇게 약속했고, 참가자 이름·연락처는 어디에도 넣지 않는다.

  ⚠️ 지표는 **전일까지만** 보여준다(public-read.ts 주석). 실시간으로 열면 경쟁팀이
  남의 유입을 분 단위로 추적할 수 있고 그게 곧 어뷰징 유인이 된다.

  ⚠️ **지표 공개에 동의하지 않은 팀은 숫자 자리를 통째로 뺀다.** 0으로 그리면
  "지표가 없는 팀"으로 읽혀 동의하지 않은 것이 불이익이 된다.
*/

const NUM = new Intl.NumberFormat("ko-KR");

/*
  Sparkline은 「작을수록 위」인 y좌표 배열을 받는다(컴포넌트 주석, 기준 높이 18).
  방문 수는 반대로 클수록 위라 뒤집어서 넘긴다. 최댓값이 0이면 호출하지 않으므로
  (화면에서 걸러진다) 여기서 0으로 나누는 일은 없다.
*/
const SPARK_BASE = 18;

function toSparkValues(series: number[]): number[] {
  const max = Math.max(...series);
  if (max === 0) return series.map(() => SPARK_BASE);
  return series.map((v) => SPARK_BASE - (v / max) * SPARK_BASE);
}
const DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});

/* 공유 링크의 목적지라 카드 문구를 참가작 것으로 바꾼다 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ entryId: string }>;
}): Promise<Metadata> {
  const { entryId } = await params;
  const season = await getCurrentSeason();
  const entry = season ? await loadPublicEntry(entryId, season.id) : null;
  if (!entry) return { title: "참가작" };

  return {
    title: `${entry.ideaTitle} · ${entry.teamName}`,
    description:
      entry.ideaSummary ?? `${season?.title}에 참가한 ${entry.teamName}의 참가작입니다.`,
    alternates: { canonical: `/projects/${entryId}` },
    openGraph: {
      title: `${entry.ideaTitle} · ${entry.teamName}`,
      description: entry.ideaSummary ?? undefined,
      type: "article",
      url: `/projects/${entryId}`,
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const { access } = await guardPage("projectDetail", `/projects/${entryId}`);
  /* 레이스 전에는 보여줄 것이 없다 — 존재를 흘리지 않고 404로 덮는다 */
  if (!access.ok) notFound();

  const season = await getCurrentSeason();
  if (!season) notFound();

  const entry = await loadPublicEntry(entryId, season.id);
  if (!entry) notFound();

  const stageIndex = SEASON_STAGES.findIndex(
    (stage) => stage.key.toLowerCase() === entry.stage,
  );

  return (
    <main className={`page ${styles.page}`}>
      <NavBar {...resolveNav(season)} />
      <div className={`container container--narrow grow ${styles.wrap}`}>
        <header className={styles.head}>
          <p className={styles.meta}>
            <Link
              href={`/seasons/${season.slug}/leaderboard`}
              className={styles.back}
            >
              {season.title} 리더보드
            </Link>
          </p>
          <h1 className={styles.title}>{entry.ideaTitle}</h1>
          <p className={styles.team}>
            {entry.teamName}
            {entry.notDeployed ? <Badge tone="neutral">미배포</Badge> : null}
          </p>
          {entry.ideaSummary ? (
            <p className={styles.summary}>{entry.ideaSummary}</p>
          ) : null}

          {entry.serviceUrl && !entry.notDeployed ? (
            <div className={styles.actions}>
              {/*
                남의 서비스로 나가는 링크다. rel에 noopener를 붙이지 않으면
                열린 창이 이 페이지를 조작할 수 있다.
              */}
              <AnchorButton
                href={entry.serviceUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                size="lg"
              >
                서비스 열어보기
              </AnchorButton>
            </div>
          ) : null}
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>시즌 여정</h2>
          {/*
            프로토타입이 이 화면을 위해 만들어 둔 트랙을 그대로 쓴다
            (components/StageProgress.tsx의 JourneyTrack). 목록으로 늘어놓으면
            어디까지 왔는지가 안 보이는데, 관전자가 궁금한 것이 그것이다.
          */}
          <JourneyTrack
            steps={SEASON_STAGES.map((stage, i) => ({
              label: stage.label,
              sub: stage.gate ? `${stage.week} · ${stage.gate}` : stage.week,
              done: i <= stageIndex,
            }))}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>지표</h2>
          {!entry.metricsPublic ? (
            <p className={styles.note}>
              이 팀은 지표 공개에 동의하지 않았습니다. 심사에는 같은 기준으로
              집계된 값이 쓰입니다.
            </p>
          ) : entry.metrics === null ? (
            <p className={styles.note}>
              아직 집계된 방문이 없습니다. 지표는 하루 단위로 쌓이며, 전일까지의
              값만 공개합니다.
            </p>
          ) : (
            <>
              {/*
                시안의 카드 셋 — 유효 이용자 · 현재 순위 · 최근 7일.
                순위와 추세는 관전자가 이 화면에 오는 이유라 합계 옆에 같이 둔다.
              */}
              <dl className={styles.metrics}>
                <div>
                  <dt>유효 방문</dt>
                  <dd>{NUM.format(entry.metrics.validVisitors)}</dd>
                </div>
                <div>
                  <dt>가입</dt>
                  <dd>{NUM.format(entry.metrics.signups)}</dd>
                </div>
                <div>
                  <dt>현재 순위</dt>
                  <dd>
                    {entry.rank ? (
                      <>
                        {String(entry.rank.position).padStart(2, "0")}
                        <span className={styles.rankOf}>
                          {" "}
                          / {entry.rank.of}
                        </span>
                      </>
                    ) : (
                      /* 순위는 스냅샷이 정본이다. 없으면 비운다 */
                      <span className={styles.dash}>—</span>
                    )}
                  </dd>
                </div>
                {entry.recentVisitors.length > 0 ? (
                  <div>
                    <dt>최근 7일</dt>
                    <dd className={styles.spark}>
                      <Sparkline
                        values={toSparkValues(entry.recentVisitors)}
                        width={92}
                        height={26}
                      />
                    </dd>
                  </div>
                ) : null}
              </dl>
              <p className={styles.note}>
                {DATE.format(entry.metrics.asOf)}까지 집계된 값입니다. 실시간이
                아닙니다.
              </p>
            </>
          )}
        </section>
      </div>
      <Footer />
    </main>
  );
}
