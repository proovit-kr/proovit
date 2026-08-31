import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Fragment } from "react";

import { Badge } from "@/components/Badge";
import { LinkButton } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { NavBar } from "@/components/NavBar";
import { PHASE_LABEL } from "@/content/dashboard";
import { guardPage } from "@/lib/access";
import { loadPublicSeason } from "@/lib/public-read";
import { getCurrentSeason, resolveNav } from "@/lib/season";

import styles from "./season.module.css";

/*
  시즌 상세 — PLN3 2장 「이번 시즌이 언제 무엇을 하는 시즌인지」.

  공개 화면이다(auth: public). 로그인 없이 열리고, 관전자가 리더보드로 가기 전에
  거치는 자리다.

  ⚠️ **날짜를 지어내지 않는다.** 시즌1 캘린더가 잠정이라 `stages.opens_at`·
  `closes_at`이 비어 있다. 비어 있으면 「일정 확정 전」으로 적는다 — 임의의 날짜를
  넣으면 그걸 보고 참가자가 자기 일정을 잡는다.
*/

export const metadata: Metadata = {
  title: "시즌",
};

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
  1: "1차 심사 — 사업성",
  2: "최종 심사 — 실행",
};

function gateLabel(no: number): string {
  return GATE_LABEL[no] ?? "심사";
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
  /* 헤더 버튼은 랜딩과 같은 판정을 쓴다(resolveNav) */
  const current = await getCurrentSeason();
  const scheduled = season.stages.some((stage) => stage.opensAt !== null);

  return (
    <main className={`page ${styles.page}`}>
      <NavBar {...resolveNav(current)}
      />
      <div className={`container grow ${styles.wrap}`}>
        <header className={styles.head}>
          <p className={styles.meta}>
            <Badge tone="outline">{PHASE_LABEL[season.phase] ?? "진행"}</Badge>
            {season.theme ? (
              <span className={styles.theme}>{season.theme}</span>
            ) : null}
          </p>
          <h1 className={styles.title}>{season.title}</h1>
          <p className={styles.lead}>
            5주 동안 다섯 번 제출하고 두 번 심사받습니다. 순위는 발표가 아니라
            실제 이용자 지표로 갈립니다.
          </p>
          <div className={styles.actions}>
            {action ? (
              <LinkButton href={action.href} size="lg">
                {action.label}
              </LinkButton>
            ) : null}
            <LinkButton
              href={`/seasons/${season.slug}/leaderboard`}
              variant="outline"
              size="lg"
            >
              리더보드 보기
            </LinkButton>
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
                    <span className={styles.stageName}>{stage.name}</span>
                    <span className={styles.stageWhen}>
                      {stage.opensAt && stage.closesAt
                        ? `${DATE.format(stage.opensAt)} ~ ${DATE.format(stage.closesAt)}`
                        : "일정 확정 전"}
                    </span>
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
