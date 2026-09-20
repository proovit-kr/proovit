import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Fragment } from "react";

import { Badge } from "@/components/Badge";
import { LinkButton } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { NavBar } from "@/components/NavBar";
import { PHASE_LABEL } from "@/content/dashboard";
import { SEASON_GATE_TAIL, SEASON_STAGE_DETAIL } from "@/content/landing";
import { guardPage } from "@/lib/access";
import { loadPublicSeason } from "@/lib/public-read";
import { loadPublicNav } from "@/lib/header-read";

import styles from "./season.module.css";

/*
  시즌 상세 — PLN3 2장 「이번 시즌이 언제 무엇을 하는 시즌인지」.

  공개 화면이다(auth: public). 로그인 없이 열리고, 관전자가 리더보드로 가기 전에
  거치는 자리다.

  ⚠️ **날짜를 지어내지 않는다.** 시즌1 캘린더가 잠정이라 `stages.opens_at`·
  `closes_at`이 비어 있다. 비어 있으면 「일정 확정 전」으로 적는다 — 임의의 날짜를
  넣으면 그걸 보고 참가자가 자기 일정을 잡는다.
*/

/*
  제목·설명에 시즌명이 들어가야 한다. 정적 `metadata`로 두면 시즌이 무엇이든
  검색 결과와 공유 카드가 「시즌, PROOVIT」 하나로 나온다 — 시즌마다 남는
  아카이브인데 서로 구분이 안 된다.

  `loadPublicSeason`은 `cache()`로 감싸 두어 본문과 조회를 나눠 쓴다.
*/
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const season = await loadPublicSeason(slug);
  /* 없는 시즌은 본문이 404를 낸다. 제목만 무난한 것으로 두고 넘긴다 */
  if (!season) return { title: "시즌" };

  const description = season.theme
    ? `${season.title} — ${season.theme}. 일정과 심사 게이트, 참가 방법을 확인하세요.`
    : `${season.title}의 일정과 심사 게이트, 참가 방법을 확인하세요.`;

  return {
    title: season.title,
    description,
    alternates: { canonical: `/seasons/${season.slug}` },
    openGraph: {
      type: "website",
      title: season.title,
      description,
      url: `/seasons/${season.slug}`,
    },
  };
}

const DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});

/** 지금 페이즈에서 관전자·참가 희망자가 할 수 있는 일 */
function cta(phase: string): { href: string; label: string } | null {
  if (phase === "pre_apply") {
    return { href: "/?preregister=1", label: "사전 신청하기" };
  }
  if (phase === "recruiting") return { href: "/apply", label: "참가 신청하기" };
  return null;
}

/** 앞에서 몇 번째 게이트인가. 시즌마다 게이트 수가 달라 세어서 붙인다 */
function gateNumber(
  stages: { isGate: boolean }[],
  index: number,
): number {
  return stages.slice(0, index + 1).filter((s) => s.isGate).length;
}

/*
  게이트 이름. 시즌1은 둘뿐이고 이름이 규칙 문서에 박혀 있다(16 운영규칙 제9조).
  셋 이상인 시즌이 오면 그때는 stages에 이름 칸이 생겨야 한다 — 여기서 지어내지 않는다.
*/
const GATE_LABEL: Record<number, string> = {
  1: "1차 심사(사업성)",
  2: "2차 심사(최종)",
};

function gateLabel(no: number): string {
  const name = GATE_LABEL[no] ?? "심사";
  const tail = SEASON_GATE_TAIL[no];
  return tail ? `${name}, ${tail}` : name;
}

/* 시즌 전체 기간 한 줄 — 시안 `.ss-hero .dt`. 날짜가 없으면 줄을 통째로 뺀다 */
const ISO = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" });

function seasonRange(
  stages: { opensAt: Date | null; closesAt: Date | null }[],
): string | null {
  const opens = stages.map((s) => s.opensAt).filter((d): d is Date => !!d);
  const closes = stages.map((s) => s.closesAt).filter((d): d is Date => !!d);
  if (opens.length === 0 || closes.length === 0) return null;
  const from = new Date(Math.min(...opens.map((d) => d.getTime())));
  const to = new Date(Math.max(...closes.map((d) => d.getTime())));
  const weeks = Math.round((to.getTime() - from.getTime()) / (7 * 864e5));
  return `${ISO.format(from)} → ${ISO.format(to)}, ${weeks}주, 온라인`;
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { access } = await guardPage("seasonDetail", `/seasons/${slug}`);
  if (!access.ok) notFound();

  const season = await loadPublicSeason(slug);
  if (!season) notFound();

  const action = cta(season.phase);
  const scheduled = season.stages.some((stage) => stage.opensAt !== null);
  const range = seasonRange(season.stages);
  /* 헤더와 「리더보드 보기」가 같은 플래그를 본다 — 한 번만 읽는다 */
  const nav = await loadPublicNav();
  /*
    오늘이 든 스테이지 — 시안의 「진행 중」 배지 자리.

    ⚠️ `Date.now()`를 쓰지 않는다. `react-hooks/purity`가 렌더 중 호출을 막는다
    (리더보드의 UpdatedAt.tsx에 같은 사정이 적혀 있다). 리더보드가 쓰는
    `new Date()` 관용구를 그대로 따른다.
  */
  const today = new Date();
  const current =
    season.stages.find(
      (s) =>
        s.opensAt !== null &&
        s.closesAt !== null &&
        s.opensAt <= today &&
        today <= s.closesAt,
    )?.stageKey ?? null;

  return (
    <main className={`page ${styles.page}`}>
      {/* 헤더는 랜딩과 같은 판정을 쓴다(header-state.ts) */}
      <NavBar {...nav} />
      <div className={`container grow ${styles.wrap}`}>
        <header className={styles.head}>
          {/*
            시안 `.ld-eb` — 「SEASON 1 · 자유 주제」. 시즌 번호를 제목이 아니라
            그 위에 두는 것은 아카이브에서 시즌이 여럿 쌓일 때 번호가 먼저
            읽혀야 하기 때문이다.
          */}
          <p className={styles.eyebrow}>
            <b>SEASON {season.title.replace(/[^0-9]/g, "") || "1"}</b>
            <span>{season.tracks[0]?.name ?? season.theme ?? "자유 주제"}</span>
          </p>
          <h1 className={styles.title}>{season.title}</h1>
          {range ? <p className={styles.range}>{range}</p> : null}
          <p className={styles.meta}>
            <Badge tone="outline">{PHASE_LABEL[season.phase] ?? "진행"}</Badge>
          </p>
          <div className={styles.actions}>
            {action ? (
              <LinkButton href={action.href} size="lg">
                {action.label}
              </LinkButton>
            ) : null}
            {/* 리더보드가 꺼진 동안에는 이 버튼도 없다(2026-09-20 수연 지시) */}
            {nav.season?.flags.leaderboard ? (
              <LinkButton
                href={`/seasons/${season.slug}/leaderboard`}
                variant="outline"
                size="lg"
              >
                리더보드 보기
              </LinkButton>
            ) : null}
          </div>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>스테이지</h2>
          {!scheduled ? (
            <p className={styles.note}>
              시즌 일정은 확정되는 대로 이 자리에 올립니다. 스테이지 순서와 심사
              지점은 아래대로입니다.
            </p>
          ) : null}
          {/*
            게이트를 스테이지 안의 작은 뱃지가 아니라 **사이에 놓인 띠**로 그린다.
            게이트는 스테이지의 속성이 아니라 스테이지와 스테이지 사이에서
            팀이 갈리는 지점이고, 참가자가 일정을 볼 때 가장 먼저 찾는 것이 그 자리다.
          */}
          <ol className={styles.stages}>
            {season.stages.map((stage, i) => (
              <Fragment key={stage.stageKey}>
                <li className={styles.stage}>
                  <span className={styles.stageKey}>
                    {stage.stageKey.toUpperCase()}
                  </span>
                  <span className={styles.stageBody}>
                    <span className={styles.stageHead}>
                      <span className={styles.stageName}>
                        {SEASON_STAGE_DETAIL[stage.stageKey]?.name ?? stage.name}
                      </span>
                      <span className={styles.stageWhen}>
                        {i + 1}주차
                        {stage.opensAt && stage.closesAt
                          ? `, ${DATE.format(stage.opensAt)} ~ ${DATE.format(stage.closesAt)}`
                          : ", 일정 확정 전"}
                      </span>
                      {/* 지금 이 스테이지가 돌고 있으면 시안처럼 배지를 단다 */}
                      {current === stage.stageKey ? (
                        <Badge>진행 중</Badge>
                      ) : null}
                    </span>
                    {/*
                      그 주에 무엇을 내는가. 시안 `.tl-item p`다 — 참가를 재는
                      사람이 실제로 찾는 줄이라 카드에서 빠지면 일정표가 된다.
                    */}
                    {SEASON_STAGE_DETAIL[stage.stageKey] ? (
                      <span className={styles.stageSubmits}>
                        {SEASON_STAGE_DETAIL[stage.stageKey].submits}
                      </span>
                    ) : null}
                  </span>
                </li>
                {stage.isGate ? (
                  <li className={styles.gate} aria-label="심사 게이트">
                    <span className={styles.gateNo}>
                      GATE {gateNumber(season.stages, i)}
                    </span>
                    <span className={styles.gateText}>
                      {gateLabel(gateNumber(season.stages, i))}
                    </span>
                  </li>
                ) : null}
              </Fragment>
            ))}
          </ol>
        </section>

        {/* 트랙은 시즌마다 다르고 시즌1은 비어 있을 수 있다 — 없으면 절을 통째로 뺀다 */}
        {season.tracks.length > 0 ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>트랙</h2>
            <ul className={styles.tracks}>
              {season.tracks.map((track) => (
                <li key={track.name} className={styles.track}>
                  <span className={styles.trackName}>{track.name}</span>
                  {track.description ? (
                    <span className={styles.trackDesc}>
                      {track.description}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <Footer />
    </main>
  );
}
