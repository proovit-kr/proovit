import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { LinkButton } from "@/components/Button";
import { StageProgress } from "@/components/StageProgress";
import { SEASON_STAGES } from "@/content/landing";
import {
  BLOCKED_COPY,
  HEADLINE,
  HUB_LINKS,
  ONBOARDING_STEPS,
  PHASE_LABEL,
} from "@/content/dashboard";
import { EntryStage, EntryStatus } from "@/generated/prisma/client";
import { guardPage, isAwaitingGate, isOnboardingComplete } from "@/lib/access";
import { resolveDashboardState } from "@/lib/dashboard-state";

import styles from "./hub.module.css";

/*
  대시보드 허브 — PLN3 화면정의서 2장 「대시보드」 · 3.1 「정상 흐름」 9행.

  **이 화면은 판정을 하지 않는다.** `resolveDashboardState()`가 내린 결론
  (`nextAction`·`blockedReasons`)을 그리기만 한다. `GET /api/v1/me`가 부르는
  것과 같은 함수라 API와 화면의 결론이 어긋날 수 없다(그 라우트 주석 참조).

  화면이 정하는 것은 문구뿐이다 — 사유 키를 사람 말로 바꾸는 사전은
  `src/content/dashboard.ts`에 있다.

  ⚠️ 숫자를 지어내지 않는다(CLAUDE.md 규칙 1). 지표·순위·마감 카운트다운은
  값이 아직 없어서 이 화면에 없다. 프로토타입의 「진행률 72%」·상금 티커는
  전부 목데이터였고 옮기지 않았다.
*/

export const metadata: Metadata = {
  title: "대시보드",
  robots: { index: false, follow: false },
};

/*
  진행 바에서 지금 칸이 어디인가.

  ⚠️ `entry.stage`는 **마지막으로 완료한 단계**라 그대로 쓰면 한 칸 뒤를 가리킨다.
  게이트 스테이지(s2·s5)에 멈춘 팀은 판정 대기라 다음 칸으로 넘기지 않고
  그 자리에 세워둔다 — 넘기면 통과한 것처럼 보인다.
*/
const STAGE_INDEX: Record<EntryStage, number> = {
  applied: 0,
  s1: 1,
  s2: 1,
  s3: 2,
  s4: 3,
  s5: 4,
  completed: SEASON_STAGES.length,
};

export default async function Page() {
  const { viewer } = await guardPage("dashboard", "/dashboard");

  /*
    라우트 정책이 `entry: true`라 참가 기록이 없으면 canAccess가 이미 404를 냈다.
    여기 오는 건 타입을 좁히기 위한 방어다.
  */
  if (!viewer.season || !viewer.entry) notFound();

  const { season, entry, team, onboarding } = viewer;
  const onboardingComplete = isOnboardingComplete(onboarding);
  const { nextAction, blockedReasons } = resolveDashboardState({
    phase: season.phase,
    flags: season.flags,
    entry,
    onboarding,
    onboardingComplete,
  });

  const stageIndex = STAGE_INDEX[entry.stage];
  const awaitingGate =
    entry.status === EntryStatus.active && isAwaitingGate(entry.stage);

  /* 온보딩 중에는 체크리스트가 곧 할 일 목록이라 사유를 두 번 쓰지 않는다 */
  const showChecklist = !onboardingComplete;
  const reasons = blockedReasons.filter(
    (reason) =>
      !showChecklist ||
      !["team_not_ready", "hostname_not_verified", "deposit_unpaid"].includes(
        reason,
      ),
  );

  /*
    머리글은 「지금 무엇을 하나」 한 문장이다. 할 일이 있으면 그게 제목이고,
    없으면 **기다리는 이유**가 제목이다.

    ⚠️ 여기를 "지금 하실 일은 없어요"로 고정해두면 시즌 시작 전 팀에게
    그 문장과 아래 체크리스트가 동시에 뜬다(8/14에 실제로 그렇게 나왔다).
    제목으로 쓴 사유는 아래 목록에서 뺀다 — 같은 문장을 두 번 읽히지 않는다.
  */
  const headlineReason = nextAction ? null : (reasons[0] ?? null);
  const restReasons = headlineReason ? reasons.slice(1) : reasons;
  const headline = nextAction
    ? (HEADLINE[nextAction.key] ?? nextAction.label)
    : awaitingGate
      ? BLOCKED_COPY.gate_review.title
      : (headlineReason && BLOCKED_COPY[headlineReason].title) ??
        "지금 하실 일은 없어요";
  const headlineHint = headlineReason
    ? BLOCKED_COPY[headlineReason].hint
    : null;

  /*
    보증금 항목을 걸러내던 필터가 여기 있었다. 시안 v2.1이 보증금을
    보류(도입 미정)로 두어 `ONBOARDING_STEPS`에서 항목 자체가 빠졌다.
  */
  const steps = ONBOARDING_STEPS;

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <div className={styles.headTop}>
          <p className={styles.season}>
            <Link href={`/seasons/${season.slug}`} className={styles.seasonLink}>
              {season.title}
            </Link>
            <Badge tone="outline">{PHASE_LABEL[season.phase] ?? "진행"}</Badge>
          </p>
          {team ? <p className={styles.team}>{team.name}</p> : null}
        </div>

        <h1 className={styles.title}>{headline}</h1>
        {headlineHint ? <p className={styles.lead}>{headlineHint}</p> : null}

        {nextAction ? (
          <div className={styles.cta}>
            <LinkButton href={nextAction.href} size="lg">
              {nextAction.label}
            </LinkButton>
            {team && !team.isLeader ? (
              <p className={styles.ctaNote}>
                제출과 팀 관리는 팀장만 할 수 있어요.
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className={styles.stages}>
        <StageProgress stages={SEASON_STAGES} currentIndex={stageIndex} />
      </div>

      {showChecklist ? (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>먼저 끝낼 것</h2>
          <ol className={styles.checklist}>
            {steps.map((step) => {
              const done = onboarding[step.key];
              return (
                <li
                  key={step.key}
                  className={done ? styles.itemDone : styles.item}
                >
                  <span className={styles.mark} aria-hidden>
                    {done ? "완료" : "—"}
                  </span>
                  <span className={styles.itemBody}>
                    <span className={styles.itemLabel}>{step.label}</span>
                    <span className={styles.itemHint}>
                      {done ? step.done : step.todo}
                    </span>
                  </span>
                  {done ? null : (
                    <Link href={step.href} className={styles.itemLink}>
                      바로가기
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {restReasons.length > 0 ? (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>알아두실 것</h2>
          <ul className={styles.reasons}>
            {restReasons.map((reason) => {
              const copy = BLOCKED_COPY[reason];
              return (
                <li key={reason} className={styles.reason}>
                  <span className={styles.reasonTitle}>{copy.title}</span>
                  <span className={styles.reasonHint}>{copy.hint}</span>
                  {copy.href && copy.actionable ? (
                    <Link href={copy.href} className={styles.itemLink}>
                      바로가기
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>내 참가</h2>
        <ul className={styles.links}>
          {HUB_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className={styles.link}>
                <span className={styles.linkLabel}>{link.label}</span>
                <span className={styles.linkDesc}>{link.desc}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
