import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { Sparkline } from "@/components/Sparkline";
import { AnchorButton } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { NavBar } from "@/components/NavBar";
import { guardPage } from "@/lib/access";
import { loadPublicEntry } from "@/lib/public-read";
import { loadPublicNav } from "@/lib/header-read";
import { getCurrentSeason } from "@/lib/season";

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


  return (
    <main className={`page ${styles.page}`}>
      <NavBar {...(await loadPublicNav())} />
      <div className={`container container--narrow grow ${styles.wrap}`}>
        {/*
          시안 `.pj-back` — 「← 리더보드」. 관전자가 이 화면에 오는 길이
          리더보드뿐이라 돌아가는 길을 첫 줄에 둔다.
        */}
        <Link
          href={`/seasons/${season.slug}/leaderboard`}
          className={styles.back}
        >
          ← 리더보드
        </Link>

        <header className={styles.head}>
          {/*
            시안 `.pj-head` — **제목은 팀명**이다. 아이디어명이 아니다.
            리더보드가 팀명으로 줄을 세우므로 거기서 넘어온 사람이 같은 이름을
            첫 줄에서 봐야 자기가 누른 것을 확인한다.
          */}
          <div className={styles.headRow}>
            <h1 className={styles.title}>{entry.teamName}</h1>
            {/* 시즌 1은 자유 주제 단일 트랙이다 — 시안도 테마 트랙을 시즌 2로 미뤄 두었다 */}
            <span className={styles.chip}>자유 주제 트랙</span>
            {entry.notDeployed ? (
              <Badge tone="neutral">미배포</Badge>
            ) : (
              <Badge>✓ 검증됨</Badge>
            )}
          </div>

          {/* 아이디어명은 제목 자리를 내주고 한 줄 소개 위로 내려온다 */}
          <p className={styles.idea}>{entry.ideaTitle}</p>
          {entry.ideaSummary ? (
            <p className={styles.summary}>{entry.ideaSummary}</p>
          ) : null}

          {/*
            시안 `.pj-cta-row` — 버튼 옆에 **주소를 글자로 같이 둔다.** 남의
            서비스로 나가는 링크라 어디로 가는지 눌러 보기 전에 보여야 한다.
            미배포 팀은 버튼을 숨기지 않고 비활성으로 남긴다 — 자리가 통째로
            사라지면 「아직 안 만든 팀」인지 「화면이 깨진 것」인지 모른다.
          */}
          <div className={styles.ctaRow}>
            {entry.serviceUrl && !entry.notDeployed ? (
              <>
                <AnchorButton
                  href={entry.serviceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  size="lg"
                >
                  서비스 방문하기 ↗
                </AnchorButton>
                <span className={styles.url}>
                  {entry.serviceUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </span>
              </>
            ) : (
              <span className={styles.ctaOff}>아직 배포 전이에요</span>
            )}
          </div>
        </header>


        <section className={styles.section}>
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
              {/*
                시안 `.pj-cards` — 카드 셋이다. 라벨을 영문 대문자로 두는 것도
                시안 그대로다(VALID USERS / CURRENT RANK / LAST 7 DAYS).

                ⚠️ 「가입」 칸을 두지 않는다. 시안이 세 장만 두고, 관전자에게
                필요한 것은 규모·순위·추세 셋이다. 가입 수는 팀마다 가입이
                있는지조차 다르라 비교가 성립하지 않는다.
              */}
              <dl className={styles.cards}>
                <div className={styles.card}>
                  <dt>VALID USERS</dt>
                  <dd>{NUM.format(entry.metrics.validVisitors)}</dd>
                </div>
                <div className={styles.card}>
                  <dt>CURRENT RANK</dt>
                  <dd>
                    {entry.rank ? (
                      <>
                        {String(entry.rank.position).padStart(2, "0")}
                        <span className={styles.rankOf}> / {entry.rank.of}</span>
                      </>
                    ) : (
                      /* 순위는 스냅샷이 정본이다. 없으면 비운다 */
                      <span className={styles.dash}>-</span>
                    )}
                  </dd>
                </div>
                <div className={styles.card}>
                  <dt>LAST 7 DAYS</dt>
                  <dd className={styles.spark}>
                    {entry.recentVisitors.length > 0 ? (
                      <Sparkline
                        values={toSparkValues(entry.recentVisitors)}
                        width={100}
                        height={32}
                      />
                    ) : (
                      <span className={styles.dash}>-</span>
                    )}
                  </dd>
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
