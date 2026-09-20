import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Fragment } from "react";

import { Badge } from "@/components/Badge";
import { LinkButton } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { NavBar } from "@/components/NavBar";
import { Card } from "@/components/Surface";
import { SEASON_GATE_TAIL, SEASON_STAGE_DETAIL } from "@/content/landing";
import { guardPage } from "@/lib/access";
import { loadPublicSeason } from "@/lib/public-read";
import { loadPublicNav } from "@/lib/header-read";

import styles from "./season.module.css";

/*
  시즌 상세 — 시안 `#scr-season`(1843행). PLN3 2장 「이번 시즌이 언제 무엇을
  하는 시즌인지」.

  공개 화면이다(auth: public). 로그인 없이 열리고, 관전자가 리더보드로 가기 전에
  거치는 자리다.

  시안은 한 화면에 상태 셋을 담는다 — `data-state`가 `pre`·`recruit`·`racing`.
  세 상태의 차이는 딱 둘이다.
    ① 히어로 CTA 하나가 갈린다(사전 신청 / 참가 신청 / 리더보드 보기).
    ② ③에서만 지금 도는 스테이지에 라임 테두리와 「진행 중」 배지가 붙는다.
  나머지(타임라인·게이트 띠)는 세 상태가 같다.

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

/* 시안 `.tl-item .w` — 「09.28~10.04」. 월 이름을 쓰지 않는다 */
const MD = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
});

/** `2026. 09. 28.` → `09.28` */
function md(date: Date): string {
  const [month, day] = MD.formatToParts(date)
    .filter((p) => p.type === "month" || p.type === "day")
    .map((p) => p.value);
  return `${month}.${day}`;
}

/*
  히어로 CTA. 시안은 상태마다 **primary 하나**다 — 늘 붙어 있는 outline 버튼은
  시안에 없다(`.only-pre`/`.only-recruit`/`.only-racing`이 셋 중 하나만 남긴다).

  리더보드가 꺼진 동안에는 그 하나가 사라진다(2026-09-20 수연 지시) —
  진입점을 전부 숨기는 것이 플래그의 뜻이라 여기만 열어 둘 수 없다.
*/
function cta(
  phase: string,
  slug: string,
  leaderboard: boolean,
): { href: string; label: string } | null {
  if (phase === "pre_apply") {
    return { href: "/?preregister=1", label: "사전 신청하기" };
  }
  if (phase === "recruiting") return { href: "/apply", label: "참가 신청하기" };
  /* 시안에 없는 네 번째 상태(시상 발표)도 갈 곳은 리더보드뿐이다 */
  if (phase === "racing" || phase === "awarded") {
    return leaderboard
      ? { href: `/seasons/${slug}/leaderboard`, label: "리더보드 보기" }
      : null;
  }
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

/* 시안 `.ss-hero .dt` — 시즌 전체 기간 한 줄. 날짜가 없으면 줄을 통째로 뺀다 */
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

  /* 헤더와 히어로 CTA가 같은 플래그를 본다 — 한 번만 읽는다 */
  const nav = await loadPublicNav();
  const action = cta(
    season.phase,
    season.slug,
    nav.season?.flags.leaderboard ?? false,
  );
  const range = seasonRange(season.stages);
  /*
    오늘이 든 스테이지 — 시안 ③의 라임 카드와 「진행 중」 배지 자리다.
    시안은 s4로 박아 두었지만 그건 목업의 「그때」일 뿐이라 날짜로 찾는다.
    ①②에서는 붙지 않는다 — 시안에서 `.only-racing`이 배지를 지운다.

    ⚠️ `Date.now()`를 쓰지 않는다. `react-hooks/purity`가 렌더 중 호출을 막는다
    (리더보드의 UpdatedAt.tsx에 같은 사정이 적혀 있다). 리더보드가 쓰는
    `new Date()` 관용구를 그대로 따른다.
  */
  const today = new Date();
  const current =
    season.phase === "racing"
      ? (season.stages.find(
          (s) =>
            s.opensAt !== null &&
            s.closesAt !== null &&
            s.opensAt <= today &&
            today <= s.closesAt,
        )?.stageKey ?? null)
      : null;

  return (
    <main className={`page ${styles.page}`}>
      {/* 헤더는 랜딩과 같은 판정을 쓴다(header-state.ts) — 시안의 P1·P2·P3 */}
      <NavBar {...nav} />
      <div className={`grow ${styles.wrap}`}>
        <div className={styles.hero}>
          <div>
            {/*
              시안 `.ld-eb` — 「SEASON 1 자유 주제」. 시즌 번호를 제목이 아니라
              그 위에 두는 것은 아카이브에서 시즌이 여럿 쌓일 때 번호가 먼저
              읽혀야 하기 때문이다.
            */}
            <div className={styles.eyebrow}>
              <b>SEASON {season.title.replace(/[^0-9]/g, "") || "1"}</b>
              {season.tracks[0]?.name ?? season.theme ?? "자유 주제"}
            </div>
            <h1 className={styles.title}>{season.title}</h1>
            {range ? <div className={styles.range}>{range}</div> : null}
          </div>
          <span className={styles.cta}>
            {action ? (
              <LinkButton href={action.href}>{action.label}</LinkButton>
            ) : null}
          </span>
        </div>

        {/*
          게이트를 스테이지 안의 작은 뱃지가 아니라 **사이에 놓인 띠**로 그린다.
          게이트는 스테이지의 속성이 아니라 스테이지와 스테이지 사이에서
          팀이 갈리는 지점이고, 참가자가 일정을 볼 때 가장 먼저 찾는 것이 그 자리다.
        */}
        <ol className={styles.stages}>
          {season.stages.map((stage, i) => (
            <Fragment key={stage.stageKey}>
              <Card
                as="li"
                /* 시안 `.tl-item[data-k]` — 대조 스크립트가 이 키로 행을 집는다 */
                data-k={stage.stageKey}
                className={`${styles.stage}${
                  current === stage.stageKey ? ` ${styles.stageCurrent}` : ""
                }`}
              >
                <span className={styles.stageKey}>{stage.stageKey}</span>
                <div>
                  <h4 className={styles.stageHead}>
                    {SEASON_STAGE_DETAIL[stage.stageKey]?.name ?? stage.name}
                    <span className={styles.stageWhen}>
                      {i + 1}주차
                      {stage.opensAt && stage.closesAt
                        ? `, ${md(stage.opensAt)}~${md(stage.closesAt)}`
                        : ", 일정 확정 전"}
                    </span>
                    {current === stage.stageKey ? <Badge>진행 중</Badge> : null}
                  </h4>
                  {/*
                    그 주에 무엇을 내는가. 시안 `.tl-item p`다 — 참가를 재는
                    사람이 실제로 찾는 줄이라 카드에서 빠지면 일정표가 된다.
                  */}
                  {SEASON_STAGE_DETAIL[stage.stageKey] ? (
                    <p className={styles.stageSubmits}>
                      {SEASON_STAGE_DETAIL[stage.stageKey].submits}
                    </p>
                  ) : null}
                </div>
              </Card>
              {stage.isGate ? (
                <li className={styles.gate} aria-label="심사 게이트">
                  <b className={styles.gateNo}>
                    GATE {gateNumber(season.stages, i)}
                  </b>
                  {gateLabel(gateNumber(season.stages, i))}
                </li>
              ) : null}
            </Fragment>
          ))}
        </ol>
      </div>
      <Footer />
    </main>
  );
}
