import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { AnchorButton } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { NavBar } from "@/components/NavBar";
import { SEASON_STAGES } from "@/content/landing";
import { guardPage } from "@/lib/access";
import { loadPublicEntry } from "@/lib/public-read";
import { getCurrentSeason, resolveNavCta } from "@/lib/season";

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
    openGraph: {
      title: `${entry.ideaTitle} · ${entry.teamName}`,
      description: entry.ideaSummary ?? undefined,
      type: "article",
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
      <NavBar cta={resolveNavCta(season)} />
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
          <h2 className={styles.sectionTitle}>진행</h2>
          <ol className={styles.stages}>
            {SEASON_STAGES.map((stage, i) => (
              <li
                key={stage.key}
                className={i <= stageIndex ? styles.stageDone : styles.stage}
              >
                <span className={styles.stageKey}>{stage.key}</span>
                <span>{stage.label}</span>
              </li>
            ))}
          </ol>
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
              <dl className={styles.metrics}>
                <div>
                  <dt>유효 방문</dt>
                  <dd>{NUM.format(entry.metrics.validVisitors)}</dd>
                </div>
                <div>
                  <dt>가입</dt>
                  <dd>{NUM.format(entry.metrics.signups)}</dd>
                </div>
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
