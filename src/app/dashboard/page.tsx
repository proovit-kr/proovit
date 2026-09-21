import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { Button, LinkButton } from "@/components/Button";
import { Countdown } from "@/components/Countdown";
import { Icon } from "@/components/Icon";
import { Card, Chip } from "@/components/Surface";
import { BLOCKED_COPY } from "@/content/dashboard";
import {
  HUB_ACT,
  HUB_GOLDEN_PATH,
  HUB_HEAD,
  HUB_LABEL,
  HUB_LOCK,
  HUB_NO_ENTRY,
  HUB_ONBOARDING,
} from "@/content/hub";
import { guardPage, isOnboardingComplete, type ViewerState } from "@/lib/access";
import { resolveDashboardState } from "@/lib/dashboard-state";
import { devNow } from "@/lib/dev-clock";
import { fmtMD, fmtMDHM } from "@/lib/header-state";
import { loadHub, type HubStep, type HubView } from "@/lib/hub-read";
import { resolveHubPane } from "@/lib/hub-state";
import { isRecruiting } from "@/lib/season-phase";

import { CopyLink } from "./CopyLink";
import styles from "./hub.module.css";

/*
  대시보드 허브 — 시안 `#scr-hub`의 「정상 흐름」 아홉(h1~h9).

  **이 화면은 판정을 하지 않는다.** 어느 판인지는 `resolveHubPane()`이, 재료는
  `loadHub()`가 정한다. 여기가 정하는 것은 마크업과 문구 자리뿐이고, 문구 자체는
  `content/hub.ts`에 있다.

  ⚠️ **숫자를 지어내지 않는다.** 시안 목업의 471·24·1,248은 전부 데이터 자리다.
  우리가 세지 않는 값(주간 활성·재방문율)은 만들지 않고 「—」로 둔다 —
  참가작 ② 미배포에서 순위를 「-」로 둔 것과 같은 규칙이다.

  ⚠️ **예외 여덟(h10~h17)은 아직 안 옮겼다.** 탈락·실격·미배포 레이스 같은
  상태에서는 `resolveHubPane()`이 null을 내고, 아래 `Fallback`이 옛 안내를
  그린다. 그 판들을 옮길 때 이 자리가 없어진다.
*/

export const metadata: Metadata = {
  title: "대시보드",
  robots: { index: false, follow: false },
};

const NUM = new Intl.NumberFormat("ko-KR");

/** 시안이 순위를 두 자리로 적는다(「02 / 12」) */
const rankText = (rank: number | null) =>
  rank === null ? "-" : String(rank).padStart(2, "0");

const won = (value: bigint) => `₩${NUM.format(value)}`;

/* 우리가 세지 않는 지표. 정의가 오면 값이 들어온다(PLN6 6장 1번) */
const UNKNOWN = "—";

export default async function Page() {
  const { viewer } = await guardPage("dashboard", "/dashboard");

  /*
    **참가 기록이 없어도 여기까지 온다**(access-policy의 `dashboard` 주석).
    대시보드가 온보딩의 출발점이라 404로 막지 않고 신청으로 이어 준다.
  */
  if (!viewer.season || !viewer.entry) {
    return <NoEntry recruiting={!!viewer.season && isRecruiting(viewer.season.phase)} />;
  }

  const { season, entry, onboarding } = viewer;
  const onboardingComplete = isOnboardingComplete(onboarding);
  const pane = resolveHubPane({
    phase: season.phase,
    entry,
    onboardingComplete,
  });

  if (!pane) return <Fallback viewer={viewer} />;

  const view = await loadHub(viewer, pane);
  const head = HUB_HEAD[pane];
  /*
    시상·아카이브의 제목은 시즌명이 앞에 선다(시안 「시즌 1 결과」).
    시즌명은 데이터라 문구 파일이 들지 않는다.
  */
  const title =
    pane === "awarded" || pane === "archived"
      ? `${season.title} ${head.title}`
      : head.title;

  return (
    <section data-probe="hub" data-pane={pane}>
      <h2 className={styles.h1}>{title}</h2>
      <p className={styles.sub}>{head.sub}</p>
      <Body view={view} />
    </section>
  );
}

/* ── 판별로 다른 속 ────────────────────────────────────── */

function Body({ view }: { view: HubView }) {
  switch (view.pane) {
    case "onboarding": {
      const act = view.teamReady
        ? HUB_ACT.onboardingMeasurement
        : HUB_ACT.onboardingTeam;
      return (
        <>
          <GoldenPath title={HUB_ONBOARDING.title} steps={view.steps} numbered />
          <Hero act={act} />
        </>
      );
    }

    case "s1":
      return (
        <>
          <GoldenPath title={HUB_GOLDEN_PATH.s1.title} steps={view.steps} />
          <Hero
            act={HUB_ACT.s1}
            body={
              view.dueAt
                ? `${HUB_ACT.s1.body} 마감은 ${fmtMDHM(view.dueAt)}예요.`
                : HUB_ACT.s1.body
            }
          />
        </>
      );

    case "s2":
      return (
        <>
          {view.dueAt ? <Due dueAt={view.dueAt} /> : null}
          <GoldenPath title={HUB_GOLDEN_PATH.s2.title} steps={view.steps} />
          <Hero act={HUB_ACT.s2} />
        </>
      );

    case "gate1":
      return (
        <>
          <Card className={styles.sum}>
            <div>
              <span>{HUB_LABEL.landingUrl}</span>
              <b>{view.landingUrl ?? UNKNOWN}</b>
            </div>
            <div>
              <span>{HUB_LABEL.visitors}</span>
              <b>{NUM.format(view.visitors)}</b>
            </div>
            <div>
              <span>{HUB_LABEL.leads}</span>
              <b>{NUM.format(view.leads)}</b>
            </div>
            <div>
              <span>{HUB_LABEL.conversion}</span>
              <b>{view.conversion === null ? UNKNOWN : `${view.conversion}%`}</b>
            </div>
          </Card>
          {/* 시안의 🔒는 뷰어가 SVG로 바꿔치우는 이모지다 — 처음부터 아이콘으로 낸다 */}
          <span className={styles.lockpill}>
            <Icon name="lock" /> {HUB_LOCK.gate1}
          </span>
        </>
      );

    case "s3":
      return (
        <>
          <GoldenPath title={HUB_GOLDEN_PATH.s3.title} steps={view.steps} />
          <Card className={styles.sum}>
            <div>
              <span>{HUB_LABEL.measurement}</span>
              <b className={view.verified ? styles.ok : undefined}>
                {view.hostname
                  ? view.verified
                    ? `검증됨 ✓, ${view.hostname}`
                    : `확인 대기, ${view.hostname}`
                  : UNKNOWN}
              </b>
            </div>
          </Card>
          <Hero act={HUB_ACT.s3} />
        </>
      );

    case "race":
      return (
        <>
          <div className={styles.cards}>
            <Card className={styles.kpi}>
              <small>{HUB_LABEL.validUsers}</small>
              <span className="score">{NUM.format(view.validUsers)}</span>
            </Card>
            <Card className={styles.kpi}>
              <small>{HUB_LABEL.myRank}</small>
              <span className="score">
                {rankText(view.rank)}
                <span className={styles.rankTotal}> / {view.teams}</span>
              </span>
            </Card>
            <Card className={styles.kpi}>
              <small>{HUB_LABEL.today}</small>
              {/* 앞 집계가 없으면 증감을 모른다 — 0으로 적지 않는다 */}
              <span
                className={`score ${view.today === null ? styles.off : styles.up}`}
              >
                {view.today === null
                  ? "-"
                  : `${view.today >= 0 ? "+" : ""}${NUM.format(view.today)}`}
              </span>
            </Card>
          </div>
          <div className={`${styles.act} ${styles.hero}`}>
            <div>
              <h3>{HUB_ACT.race.title}</h3>
              <p>{HUB_ACT.race.body}</p>
            </div>
            <span className={styles.actBtns}>
              {view.shareUrl ? (
                <CopyLink
                  url={view.shareUrl}
                  label={HUB_ACT.race.label}
                  className={styles.actBtn}
                />
              ) : (
                <Button variant="primary" className={styles.actBtn} disabled>
                  {HUB_ACT.race.label}
                </Button>
              )}
              <LinkButton
                href={HUB_ACT.race.second.href}
                variant="outline"
                className={styles.actBtn}
              >
                {HUB_ACT.race.second.label}
              </LinkButton>
            </span>
          </div>
        </>
      );

    case "gate2":
      return (
        <>
          <div className={styles.snap}>
            <Card className={styles.snapCard}>
              <small>{HUB_LABEL.snapValidUsers}</small>
              <span className="score">{NUM.format(view.validUsers)}</span>
            </Card>
            {/* 주간 활성·재방문율은 아직 세지 않는다 */}
            <Card className={styles.snapCard}>
              <small>{HUB_LABEL.snapWeeklyActive}</small>
              <span className={`score ${styles.off}`}>{UNKNOWN}</span>
            </Card>
            <Card className={styles.snapCard}>
              <small>{HUB_LABEL.snapRetention}</small>
              <span className={`score ${styles.off}`}>{UNKNOWN}</span>
            </Card>
            <Card className={styles.snapCard}>
              <small>{HUB_LABEL.snapRevenue}</small>
              <span className="score">{won(view.revenue)}</span>
            </Card>
          </div>
          <span className={styles.lockpill}>
            <Icon name="lock" />{" "}
            {view.announceAt
              ? `${HUB_LOCK.gate2} ${fmtMD(view.announceAt)} 내 발표돼요`
              : `${HUB_LOCK.gate2} 확정되면 알려드려요`}
          </span>
        </>
      );

    case "awarded":
      return (
        <>
          <div className={`${styles.act} ${styles.hero} ${styles.actGap}`}>
            <div>
              <small className={styles.cdLabel}>{HUB_LABEL.finalRank}</small>
              <div className={styles.cd}>
                {view.rank === null ? UNKNOWN : `${view.rank}위`}
                <span className={styles.cdUnit}> / {view.teams}팀</span>
              </div>
              <p className={styles.cdNote}>
                {view.teamName}, 유효 이용자 {NUM.format(view.validUsers)}명으로
                시즌을 마쳤어요 🎉
              </p>
            </div>
            {/* 수상은 운영이 남긴 것만 — 순위에서 유추하지 않는다 */}
            {view.award ? (
              <Badge
                tone="lime"
                className={`${styles.selfCenter} ${styles.awardBadge}`}
              >
                {view.award}
              </Badge>
            ) : null}
          </div>
          <div className={styles.act}>
            <div>
              <h3>{HUB_ACT.deposit.title}</h3>
              <p>{HUB_ACT.deposit.body}</p>
            </div>
            <span className={`${styles.actBtns} ${styles.actBtnsCenter}`}>
              {/* 묶음이 이미 가운데라 시안은 배지에 align-self를 주지 않는다 */}
              <Badge tone="warn">
                <Icon name="warn" /> {HUB_ACT.deposit.badge}
              </Badge>
              {/* 도입 미정이라 갈 곳이 없다. 자리만 남긴다 */}
              <Button variant="outline" className={styles.actBtn} disabled>
                {HUB_ACT.deposit.label}
              </Button>
            </span>
          </div>
        </>
      );

    case "archived":
      return (
        <div className={styles.snap}>
          <Card className={styles.snapCard}>
            <small>{HUB_LABEL.archiveRank}</small>
            <span className="score">
              {rankText(view.rank)} / {view.teams}
            </span>
          </Card>
          <Card className={styles.snapCard}>
            <small>{HUB_LABEL.archiveUsers}</small>
            <span className="score">{NUM.format(view.validUsers)}</span>
          </Card>
          <Card className={styles.snapCard}>
            <small>{HUB_LABEL.archiveSubmissions}</small>
            <span className="score">
              {view.submitted} / {view.stages}
            </span>
          </Card>
          <Card className={styles.snapCard}>
            <small>{HUB_LABEL.archiveGates}</small>
            <span className={`score ${styles.ok}`}>
              {view.gatesPassed} PASS
            </span>
          </Card>
        </div>
      );
  }
}

/*
  아직 신청하지 않은 사람 — 시안에 없는 판이다(content/hub.ts 주석).
  모집 중이면 신청으로 보내고, 아니면 기다릴 곳을 알려준다.
*/
function NoEntry({ recruiting }: { recruiting: boolean }) {
  const copy = recruiting ? HUB_NO_ENTRY.open : HUB_NO_ENTRY.closed;
  return (
    <section data-probe="hub" data-pane="none">
      <h2 className={styles.h1}>{copy.title}</h2>
      <p className={styles.sub}>{copy.sub}</p>
      <div className={`${styles.act} ${styles.hero}`}>
        <div>
          <h3>{copy.actTitle}</h3>
          <p>{copy.actBody}</p>
        </div>
        <LinkButton href={copy.href} variant="primary" className={styles.actBtn}>
          {copy.label}
        </LinkButton>
      </div>
    </section>
  );
}

/* ── 조각 ──────────────────────────────────────────────── */

/** 시안 `.gp` — 머리 한 줄과 단계들 */
function GoldenPath({
  title,
  steps,
  numbered,
}: {
  title: string;
  steps: HubStep[];
  /** 온보딩은 번호가 1부터다. 골든패스는 끝낸 칸을 ✓로 바꾸고 번호를 이어간다 */
  numbered?: boolean;
}) {
  return (
    <div className={styles.gp}>
      <div className={styles.gpTitle}>{title}</div>
      {steps.map((step, i) => (
        <div key={step.label} className={`${styles.gpItem} ${styles[step.state]}`}>
          <span className={styles.mark} aria-hidden>
            {step.state === "done" && !numbered ? "✓" : i + 1}
          </span>
          {step.label}
          {step.chip ? (
            <Chip className={`${styles.rgt}${step.chipMono ? " mono" : ""}`}>
              {step.chip}
            </Chip>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** 시안 `.act.hero` — 제목·설명·버튼 하나 */
function Hero({
  act,
  body,
}: {
  act: { title: string; body: string; label: string; href: string };
  /** 데이터가 섞인 설명을 화면이 따로 만들 때 */
  body?: string;
}) {
  return (
    <div className={`${styles.act} ${styles.hero}`}>
      <div>
        <h3>{act.title}</h3>
        <p>{body ?? act.body}</p>
      </div>
      <LinkButton href={act.href} variant="primary" className={styles.actBtn}>
        {act.label}
      </LinkButton>
    </div>
  );
}

/** 시안 h3의 카운트다운 줄 */
function Due({ dueAt }: { dueAt: Date }) {
  return (
    <div className={`${styles.act} ${styles.actGap}`}>
      <div>
        <small className={styles.cdLabel}>{HUB_LABEL.countdown}</small>
        <Countdown
          remainMs={dueAt.getTime() - devNow().getTime()}
          className={styles.cd}
        />
      </div>
      <Chip className={styles.selfCenter}>
        {HUB_LABEL.due} {fmtMDHM(dueAt)}
      </Chip>
    </div>
  );
}

/*
  아직 안 옮긴 판(예외 h10~h17)에서 그리는 옛 안내.

  ⚠️ 이 자리는 **임시다.** 시안의 예외 판을 옮기면 통째로 없어진다. 그때까지
  실격·탈락 팀이 빈 화면을 보지 않게만 한다.
*/
function Fallback({ viewer }: { viewer: ViewerState }) {
  if (!viewer.season || !viewer.entry) notFound();
  const { blockedReasons, nextAction } = resolveDashboardState({
    phase: viewer.season.phase,
    flags: viewer.season.flags,
    entry: viewer.entry,
    onboarding: viewer.onboarding,
    onboardingComplete: isOnboardingComplete(viewer.onboarding),
  });
  const first = blockedReasons[0];
  const copy = first ? BLOCKED_COPY[first] : null;

  return (
    <section data-probe="hub" data-pane="none">
      <h2 className={styles.h1}>{copy?.title ?? "지금 하실 일은 없어요"}</h2>
      {copy ? <p className={styles.sub}>{copy.hint}</p> : null}
      {nextAction ? (
        <div className={`${styles.act} ${styles.hero}`}>
          <div>
            <h3>{nextAction.label}</h3>
          </div>
          <LinkButton
            href={nextAction.href}
            variant="primary"
            className={styles.actBtn}
          >
            {nextAction.label}
          </LinkButton>
        </div>
      ) : null}
      <p className={styles.sub}>
        <Link href="/dashboard/judgments">심사 결과 보기</Link>
      </p>
    </section>
  );
}
