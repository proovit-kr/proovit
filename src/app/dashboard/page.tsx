import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StageKey } from "@/generated/prisma/enums";
import { Badge } from "@/components/Badge";
import { Button, LinkButton } from "@/components/Button";
import { Countdown } from "@/components/Countdown";
import { Icon } from "@/components/Icon";
import { Card, Chip } from "@/components/Surface";
import { BLOCKED_COPY } from "@/content/dashboard";
import {
  HUB_ACT,
  HUB_GATE_ORDINAL,
  HUB_GOLDEN_PATH,
  HUB_HEAD,
  HUB_LABEL,
  HUB_LOCK,
  HUB_NO_ENTRY,
  HUB_ONBOARDING,
  HUB_SANCTION_REASON,
  HUB_STEP_CHIP,
  HUB_WBAR,
} from "@/content/hub";
import { guardPage, isOnboardingComplete, type ViewerState } from "@/lib/access";
import { resolveDashboardState } from "@/lib/dashboard-state";
import { devNow } from "@/lib/dev-clock";
import { fmtMD, fmtMDHM } from "@/lib/header-state";
import {
  hasPastEntry,
  loadHub,
  loadHubAxes,
  stageDueAt,
  type HubStep,
  type HubView,
} from "@/lib/hub-read";
import { resolveHubPane } from "@/lib/hub-state";
import { isRacing, isRecruiting } from "@/lib/season-phase";

import { CopyLink } from "./CopyLink";
import styles from "./hub.module.css";

/*
  대시보드 허브 — 시안 `#scr-hub` 17판(정상 흐름 h1~h9 · 예외 h10~h17).

  **이 화면은 판정을 하지 않는다.** 어느 판인지는 `resolveHubPane()`이, 재료는
  `loadHub()`가 정한다. 여기가 정하는 것은 마크업과 문구 자리뿐이고, 문구 자체는
  `content/hub.ts`에 있다.

  ⚠️ **숫자를 지어내지 않는다.** 시안 목업의 471·24·1,248은 전부 데이터 자리다.
  우리가 세지 않는 값(주간 활성·재방문율)은 만들지 않고 「—」로 둔다 —
  참가작 ② 미배포에서 순위를 「-」로 둔 것과 같은 규칙이다.

  ⚠️ **시안의 경고줄(`.wbar`)은 제목보다 위다**(h10·h11·h13·h14). 그래서 판별
  마크업을 그리는 `Body`가 아니라 `Warn`이 따로 맨 위에 선다.

  ⚠️ **시안 17판 중 둘은 여기서 판으로 서지 않는다.**
    h16  「종료 후 쓰기 시도」 — DB 상태가 h9와 같다(아래 `Body`의 archived 주석)
    h17  참가 기록이 없는 판이라 `resolveHubPane`을 거치지 않는다(`NextSeason`)
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
    대시보드가 온보딩의 출발점이라 404로 막지 않는다 — 모집 중이면 시안 h1을
    그대로 그리고, 팀을 만드는 곳(참가 신청)으로 보낸다.
  */
  if (!viewer.season || !viewer.entry) {
    if (!viewer.season) return <NoEntry />;
    const { phase, id, title } = viewer.season;
    /*
      레이스가 시작된 뒤에 온 사람 — **시안 h10**. 아직 팀이 없어 온보딩을
      이제부터 해야 한다(2026-09-21 수연 지시). 모집 중의 같은 사람은 h1이고
      (아래), 갈리는 것은 페이즈다.
    */
    if (isRacing(phase)) return <Late seasonId={id} />;
    if (!isRecruiting(phase)) return <NoEntry />;
    /*
      지난 시즌에 참가했던 사람이면 시안 h17이다 — 다음 시즌이 열리는 순간
      그쪽이 「지금 시즌」이 되어(`getCurrentSeason`) 이번 시즌 참가 기록이
      없는 사람이 된다.
    */
    if (viewer.user && (await hasPastEntry(viewer.user.id, id))) {
      return <NextSeason title={title} />;
    }
    return <Onboarding />;
  }

  const { season, entry, onboarding } = viewer;
  const onboardingComplete = isOnboardingComplete(onboarding);
  const axes = await loadHubAxes(viewer);
  const pane = resolveHubPane({
    phase: season.phase,
    entry,
    onboardingComplete,
    measurementReady: onboarding.measurementReady,
    stageNow: axes.stageNow,
    gateFailed: axes.gateFailed,
  });

  if (!pane) return <Fallback viewer={viewer} />;

  const view = await loadHub(viewer, pane);
  const head = HUB_HEAD[pane];
  /*
    시상·아카이브의 제목은 시즌명이, 탈락(h12)의 제목은 게이트 차수가 앞에
    선다(시안 「시즌 1 결과」·「1차 심사 결과, 미통과」). 둘 다 데이터라
    문구 파일이 들지 않는다.
  */
  const title =
    pane === "awarded" || pane === "archived"
      ? `${season.title} ${head.title}`
      : view.pane === "gateFail"
        ? `${HUB_GATE_ORDINAL[view.gate]} ${head.title}`
        : head.title;

  return (
    <section data-probe="hub" data-pane={pane}>
      <Warn view={view} />
      <h2 className={styles.h1}>{title}</h2>
      {/* 시안 h10·h13은 부제가 없다 — 없는 자리에 한 줄을 지어 넣지 않는다 */}
      {head.sub ? <p className={styles.sub}>{head.sub}</p> : null}
      <Body view={view} />
    </section>
  );
}

/*
  경고줄(`.wbar`) — 시안이 판 맨 위, **제목보다 위**에 두는 한 줄.

  ⚠️ 이모지는 `Icon`으로 낸다(⚠️·⏰·⛔은 시안도 SVG로 바꿔치운다). 표에 없는
  🚀만 문구에 글자로 남아 있다(content/hub.ts 주석).
*/
function Warn({ view }: { view: HubView }) {
  switch (view.pane) {
    case "late":
      return <LateBar dueAt={view.dueAt} />;

    case "missed":
      return (
        <div className={`${styles.wbar} ${styles.wbarRed}`}>
          <Icon name="clock" fixed /> {view.gate} {HUB_WBAR.missed}
        </div>
      );

    case "undeployed":
      return (
        <div className={`${styles.wbar} ${styles.wbarWarn}`}>
          {HUB_WBAR.undeployed}
        </div>
      );

    case "disqualified":
      return (
        <div className={`${styles.wbar} ${styles.wbarRed}`}>
          <Icon name="ban" fixed /> {HUB_WBAR.disqualified}{" "}
          {/* 사유를 모르면 적지 않는다 — 틀린 사유를 박는 것보다 낫다 */}
          {view.reason ? (HUB_SANCTION_REASON[view.reason] ?? view.reason) : UNKNOWN}
        </div>
      );

    default:
      return null;
  }
}

/** 시안 h10의 경고줄. 참가 기록이 있든 없든 같은 한 줄이다 */
function LateBar({ dueAt }: { dueAt: Date | null }) {
  return (
    <div className={`${styles.wbar} ${styles.wbarWarn}`}>
      <Icon name="warn" fixed />{" "}
      {dueAt
        ? `${HUB_WBAR.late.head}(${fmtMDHM(dueAt)})${HUB_WBAR.late.tail}`
        : `${HUB_WBAR.late.head}${HUB_WBAR.late.tail}`}
    </div>
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
            {/*
              참고 지표 — 무엇을 셀지 아직 정해지지 않아(PLN6 6장 1번) 값이
              없을 수 있다. 그때는 「—」로 두고 지어내지 않는다.
            */}
            <Card className={styles.snapCard}>
              <small>{HUB_LABEL.snapWeeklyActive}</small>
              <span
                className={`score ${view.weeklyActive === null ? styles.off : ""}`}
              >
                {view.weeklyActive === null
                  ? UNKNOWN
                  : NUM.format(view.weeklyActive)}
              </span>
            </Card>
            <Card className={styles.snapCard}>
              <small>{HUB_LABEL.snapRetention}</small>
              <span
                className={`score ${view.retention === null ? styles.off : ""}`}
              >
                {view.retention === null ? UNKNOWN : `${view.retention}%`}
              </span>
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

    /*
      ⚠️ **시안 h16(「종료 후 쓰기 시도」)도 이 판이다.** DB 상태가 h9와 같고
      (`matchHubKey` 주석) 시안 배너도 둘이 같다 — 갈리는 것은 「읽기 전용」
      칩과 「쓰기 시도 데모」 상자뿐인데, 그 상자는 눌러도 아무 일이 없는
      버튼이라 제품에 둘 자리가 아니다(h8 보증금 버튼과 같은 판단). 읽기
      전용이라는 사실은 부제가 이미 말한다. 2026-09-21 내가 정함.
    */
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

    /* ── 예외 여덟 ─────────────────────────────────────── */

    case "late":
      return (
        <>
          <GoldenPath title={HUB_ONBOARDING.title} steps={view.steps} numbered />
          {/* 팀을 먼저 끝냈으면 남은 것은 측정 연동이다(h1과 같은 사정) */}
          <Hero
            act={view.teamReady ? HUB_ACT.onboardingMeasurement : HUB_ACT.late}
          />
        </>
      );

    case "missed":
      return <Act act={HUB_ACT.missed} />;

    case "gateFail":
      return (
        <>
          <Card className={styles.sum}>
            <div>
              <span>{HUB_LABEL.verdict}</span>
              {/* 이 판 자체가 미통과다 — 판정 값을 다시 읽어 가르지 않는다 */}
              <b className={styles.fail}>FAIL</b>
            </div>
            <div>
              <span>{HUB_LABEL.reasonSummary}</span>
              <b>{view.reason ?? UNKNOWN}</b>
            </div>
            <div>
              <span>{HUB_LABEL.appeal}</span>
              <b>
                {view.appealBy
                  ? `${HUB_LABEL.appealNote}, ${fmtMD(view.appealBy)}까지`
                  : HUB_LABEL.appealNote}
              </b>
            </div>
          </Card>
          <Act act={HUB_ACT.gateFail} />
        </>
      );

    case "undeployed":
      return (
        <>
          <div className={styles.cards}>
            {/*
              시안이 값 자체를 흐리게 둔다. 미배포 팀에는 집계가 쌓일 수 없어
              (`public-read.ts`의 `notDeployed`) 0과 「-」가 값이 아니라 자리다.
            */}
            <Card className={styles.kpi}>
              <small>{HUB_LABEL.validUsers}</small>
              <span className={`score ${styles.off}`}>
                {NUM.format(view.validUsers)}
              </span>
            </Card>
            <Card className={styles.kpi}>
              <small>{HUB_LABEL.myRank}</small>
              <span className={`score ${styles.off}`}>
                {rankText(view.rank)}
              </span>
            </Card>
            <Card className={styles.kpi}>
              <small>{HUB_LABEL.status}</small>
              <Badge tone="gray" className={styles.cardBadge}>
                {HUB_LABEL.notDeployed}
              </Badge>
            </Card>
          </div>
          <Hero act={HUB_ACT.undeployed} />
        </>
      );

    case "disqualified":
      return <Hero act={HUB_ACT.disqualified} />;

    case "s5":
      return (
        <>
          <div className={styles.snap}>
            <Card className={styles.snapCard}>
              <small>{HUB_LABEL.snapValidUsers}</small>
              <span className="score">{NUM.format(view.validUsers)}</span>
            </Card>
            {/* 참고 지표 — 정의가 없으면 「—」다(h7과 같은 규칙) */}
            <Card className={styles.snapCard}>
              <small>{HUB_LABEL.snapWeeklyActive}</small>
              <span
                className={`score ${view.weeklyActive === null ? styles.off : ""}`}
              >
                {view.weeklyActive === null
                  ? UNKNOWN
                  : NUM.format(view.weeklyActive)}
              </span>
            </Card>
            <Card className={styles.snapCard}>
              <small>{HUB_LABEL.snapRetention}</small>
              <span
                className={`score ${view.retention === null ? styles.off : ""}`}
              >
                {view.retention === null ? UNKNOWN : `${view.retention}%`}
              </span>
            </Card>
            <Card className={styles.snapCard}>
              <small>{HUB_LABEL.snapRevenue}</small>
              <span className="score">{won(view.revenue)}</span>
            </Card>
          </div>
          <Hero act={HUB_ACT.s5} />
        </>
      );
  }
}

/*
  아직 신청하지 않은 사람 — **시안 h1을 그대로 그린다**(2026-09-21 수연 지시).
  대시보드가 온보딩의 출발점이라 여기서 팀 구성이 시작된다.

  ⚠️ **버튼만 `/apply`로 간다.** 팀을 만드는 곳이 참가 신청 폼이고(팀명·혼자
  참가·초대 메일이 거기 있다), 참가 기록이 없으면 팀 관리는 404다.
*/
function Onboarding() {
  const head = HUB_HEAD.onboarding;
  return (
    <section data-probe="hub" data-pane="onboarding">
      <h2 className={styles.h1}>{head.title}</h2>
      <p className={styles.sub}>{head.sub}</p>
      <GoldenPath
        title={HUB_ONBOARDING.title}
        numbered
        steps={[
          {
            label: HUB_ONBOARDING.items[0],
            state: "now",
            chip: HUB_STEP_CHIP.now,
          },
          {
            label: HUB_ONBOARDING.items[1],
            state: "wait",
            chip: HUB_STEP_CHIP.wait,
          },
        ]}
      />
      <Hero act={{ ...HUB_ACT.onboardingTeam, href: "/apply" }} />
    </section>
  );
}

/*
  레이스가 시작된 뒤에 온 사람 — **시안 h10**. 아직 팀이 없어 온보딩을 이제부터
  해야 하고, 그래도 s1 마감은 남들과 같다는 것이 이 화면의 말이다.

  ⚠️ **버튼만 `/apply`로 간다**(h1의 참가 기록 없음과 같은 사정) — 팀을 만드는
  곳이 참가 신청 폼이라서다. ⚠️ 지금 `/apply`는 **모집 구간에서만 열린다**
  (`access-policy.ts`) — 레이스 중에 늦게 받아 줄 것인지는 정해진 바가 없다.
*/
async function Late({ seasonId }: { seasonId: string }) {
  const head = HUB_HEAD.late;
  return (
    <section data-probe="hub" data-pane="late">
      <LateBar dueAt={await stageDueAt(seasonId, StageKey.s1)} />
      <h2 className={styles.h1}>{head.title}</h2>
      {/* 시안 h10은 칩이 없다 — 경고줄이 이미 급하다고 말했다 */}
      <GoldenPath
        title={HUB_ONBOARDING.title}
        numbered
        steps={[
          { label: HUB_ONBOARDING.items[0], state: "now" },
          { label: HUB_ONBOARDING.items[1], state: "wait" },
        ]}
      />
      <Hero act={{ ...HUB_ACT.late, href: "/apply" }} />
    </section>
  );
}

/*
  지난 시즌에 참가했던 사람이 다음 시즌 모집을 만났을 때 — **시안 h17**.

  ⚠️ 이 사람은 이번 시즌 참가 기록이 없다. 그래서 크롬도 참가자 헤더가 아니라
  공개 헤더다(`header-read.ts`의 `loadNextSeason` 주석 — 다음 시즌이 열리는
  순간 그쪽이 「지금 시즌」이 된다). 시안의 `.db-ban` 「시즌 2, 모집 중」은
  지난 시즌을 보고 있을 때의 배너(D9)라 이 화면과 짝이 아니다.
*/
function NextSeason({ title }: { title: string }) {
  const copy = HUB_NO_ENTRY.next;
  return (
    <section data-probe="hub" data-pane="nextSeason">
      <h2 className={styles.h1}>
        {title} {copy.title}
      </h2>
      <p className={styles.sub}>{copy.sub}</p>
      <Hero
        act={{
          title: copy.actTitle,
          body: copy.actBody,
          label: `${title} ${copy.label}`,
          href: copy.href,
        }}
      />
    </section>
  );
}

/* 모집이 아니라 신청 자체가 닫혀 있을 때. 시안에 없는 판이다 */
function NoEntry() {
  const copy = HUB_NO_ENTRY.closed;
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

/**
 * 시안 `.act` — `.hero`가 아닌 상자. 버튼도 외곽선이다(h11·h12).
 *
 * 이미 끝난 시즌을 말하는 자리라 라임 상자를 쓰지 않는다 — 지금 할 일이
 * 아니라 다음 시즌 이야기다.
 */
function Act({
  act,
}: {
  act: { title: string; body: string; label: string; href: string };
}) {
  return (
    <div className={styles.act}>
      <div>
        <h3>{act.title}</h3>
        <p>{act.body}</p>
      </div>
      <LinkButton href={act.href} variant="outline" className={styles.actBtn}>
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
  시안에 대응하는 판이 없는 상태에서 그리는 옛 안내.

  예외 여덟을 옮기고 남은 자리는 셋뿐이다 — **사전신청 구간**(시즌이 아직
  안 열렸다) · **자진 포기** · **진도를 다 뺐는데 시즌은 레이스 중**. 시안이
  그리지 않는 조합이라 여기서 사실만 말한다.
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
