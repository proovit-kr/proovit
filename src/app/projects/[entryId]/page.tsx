import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { Sparkline } from "@/components/Sparkline";
import { AnchorButton, Button } from "@/components/Button";
import { Card, Chip } from "@/components/Surface";
import { Footer } from "@/components/Footer";
import { NavBar } from "@/components/NavBar";
import { guardPage } from "@/lib/access";
import { loadPublicEntry } from "@/lib/public-read";
import { loadPublicNav } from "@/lib/header-read";
import { getCurrentSeason } from "@/lib/season";

import styles from "./project.module.css";

/*
  참가작 상세 — 시안 `#scr-project`(1800행), PLN3 2장 「참가자가 공유하는
  링크의 목적지」. 시안이 그리는 상태는 둘이다 — ① 정상 ② 미배포.

  ⚠️ 공개하는 것은 **팀명·참가작 명칭·소개·URL·지표**까지다. 동의 문안 A의
  「공개 범위 안내」가 그렇게 약속했고, 참가자 이름·연락처는 어디에도 넣지 않는다.

  ⚠️ 지표는 **전일까지만** 보여준다(public-read.ts 주석). 실시간으로 열면 경쟁팀이
  남의 유입을 분 단위로 추적할 수 있고 그게 곧 어뷰징 유인이 된다.

  ⚠️ **지표 공개에 동의하지 않은 팀은 숫자 자리를 통째로 뺀다.** 0으로 그리면
  "지표가 없는 팀"으로 읽혀 동의하지 않은 것이 불이익이 된다.
*/

const NUM = new Intl.NumberFormat("ko-KR");

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

  /* 헤더와 「← 리더보드」가 같은 플래그를 본다 — 한 번만 읽는다 */
  const nav = await loadPublicNav();

  /* 주소가 있고 소유 검증까지 끝난 팀만 「배포됨」이다 */
  const serviceUrl = entry.notDeployed ? null : entry.serviceUrl;

  return (
    <main className={`page ${styles.page}`}>
      <NavBar {...nav} />
      <div className={`${styles.wrap} grow`}>
        {/*
          시안 `.pj-back` — 「← 리더보드」. 관전자가 이 화면에 오는 길이
          리더보드뿐이라 돌아가는 길을 첫 줄에 둔다.

          ⚠️ 리더보드가 꺼져 있으면 이 줄도 없다(2026-09-20 수연 결정). 참가작은
          계속 열리지만 돌아갈 곳이 404다.
        */}
        {nav.season?.flags.leaderboard ? (
          <Link
            href={`/seasons/${season.slug}/leaderboard`}
            className={`${styles.back} mono`}
          >
            ← 리더보드
          </Link>
        ) : null}

        {/*
          시안 `.pj-head` — **제목은 팀명**이다. 아이디어명이 아니다.
          리더보드가 팀명으로 줄을 세우므로 거기서 넘어온 사람이 같은 이름을
          첫 줄에서 봐야 자기가 누른 것을 확인한다.
        */}
        <div className={styles.head}>
          <h1 className={styles.title}>{entry.teamName}</h1>
          {/* 시즌 1은 자유 주제 단일 트랙이다 — 시안도 테마 트랙을 시즌 2로 미뤄 두었다 */}
          <Chip>자유 주제 트랙</Chip>
          {entry.notDeployed ? (
            <Badge tone="gray">미배포</Badge>
          ) : (
            <Badge tone="lime">✓ 검증됨</Badge>
          )}
        </div>

        {/*
          시안 `.pj-con` — **문단 하나다.** 소개가 없는 팀은 그 자리에
          참가작명을 둔다. 빈 줄로 남기면 「무엇을 만들었나」가 사라진다.
        */}
        <p className={styles.con}>{entry.ideaSummary ?? entry.ideaTitle}</p>

        {/*
          시안 `.pj-cta-row` — 버튼 옆에 **주소를 글자로 같이 둔다.** 남의
          서비스로 나가는 링크라 어디로 가는지 눌러 보기 전에 보여야 한다.
          미배포 팀은 버튼을 숨기지 않고 비활성으로 남긴다 — 자리가 통째로
          사라지면 「아직 안 만든 팀」인지 「화면이 깨진 것」인지 모른다.
        */}
        <div className={styles.ctaRow}>
          {serviceUrl ? (
            <>
              {/* 크기는 시안이 쓰는 자리마다 인라인으로 준다 — 1824행 */}
              <AnchorButton
                href={serviceUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                size="lg"
                style={{ padding: "13px 26px" }}
              >
                서비스 방문하기 ↗
              </AnchorButton>
              <span className={styles.url}>
                {serviceUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </span>
            </>
          ) : (
            /* 시안 1825행은 변형 없는 `<button class="btn" disabled>`다 */
            <Button variant="ghost" size="lg" style={{ padding: "13px 26px" }} disabled>
              아직 배포 전이에요
            </Button>
          )}
        </div>

        {/*
          시안 `.pj-cards` — 카드 셋이다. 라벨을 영문 대문자로 두는 것도
          시안 그대로다(VALID USERS / CURRENT RANK / LAST 7 DAYS).

          ⚠️ 「가입」 칸을 두지 않는다. 시안이 세 장만 두고, 관전자에게
          필요한 것은 규모·순위·추세 셋이다. 가입 수는 팀마다 가입이
          있는지조차 달라 비교가 성립하지 않는다.
        */}
        {entry.metricsPublic ? (
          <div className={styles.cards}>
            <Card className={styles.card}>
              <small>VALID USERS</small>
              <span
                className={`score ${entry.metrics?.validVisitors ? "" : styles.off}`}
              >
                {NUM.format(entry.metrics?.validVisitors ?? 0)}
              </span>
            </Card>
            <Card className={styles.card}>
              <small>CURRENT RANK</small>
              {/*
                ⚠️ **미배포 팀은 순위를 적지 않는다**(시안 ②도 「-」다).
                스냅샷에 줄이 남아 있어도 배포 전에는 측정이 시작되지 않아
                그 등수가 무엇을 재서 나온 것인지 말할 수 없다.
              */}
              {entry.rank && !entry.notDeployed ? (
                <span className={styles.rkv}>
                  {String(entry.rank.position).padStart(2, "0")}
                  <span className={styles.rankOf}> / {entry.rank.of}</span>
                </span>
              ) : (
                <span className={`${styles.rkv} ${styles.off}`}>-</span>
              )}
            </Card>
            <Card className={styles.card}>
              <small>LAST 7 DAYS</small>
              {/* 값이 전부 0이면 Sparkline이 평평한 선을 그린다 — 시안 ② */}
              <Sparkline values={entry.recentVisitors} className={styles.spark} />
            </Card>
          </div>
        ) : (
          <p className={styles.note}>
            이 팀은 지표 공개에 동의하지 않았습니다. 심사에는 같은 기준으로
            집계된 값이 쓰입니다.
          </p>
        )}
      </div>
      <Footer />
    </main>
  );
}
