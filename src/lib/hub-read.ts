import "server-only";

import {
  EntryStage,
  EntryStatus,
  JudgmentResult,
  SanctionStage,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { HUB_GOLDEN_PATH, HUB_ONBOARDING, HUB_STEP_CHIP } from "@/content/hub";
import type { ViewerState } from "@/lib/access";
import { addBusinessDays, APPEAL_BUSINESS_DAYS } from "@/lib/appeal";
import { devNow } from "@/lib/dev-clock";
import { conversionRate, currentStage } from "@/lib/header-state";
import type { HubPane } from "@/lib/hub-state";
import { seoulDateOnly } from "@/lib/measure";
import { prisma } from "@/lib/prisma";
import { loadLeaderboard } from "@/lib/public-read";
import { isRacing } from "@/lib/season-phase";

/*
  허브가 그릴 **재료를 모으는 곳.** 판정은 hub-state.ts(순수), 그리기는
  `app/dashboard/page.tsx`가 한다 — header-read.ts와 같은 삼분할이다.

  ⚠️ **숫자를 지어내지 않는다.** 시안 목업의 471·24·1,248은 전부 데이터다.
  우리가 세지 않는 값(주간 활성·재방문율)은 만들지 않고 「—」로 둔다.

  ⚠️ **순위는 여기서 계산하지 않는다.** 정본은 `leaderboard_snapshots`이고
  `loadLeaderboard()`가 그것을 읽는다 — 허브가 자기 식으로 세면 리더보드와
  다른 등수가 나오고, 그게 곧 분쟁이 된다(dashboard-read.ts와 같은 규칙).

  ⚠️ **판을 고른 뒤에 필요한 것만 읽는다.** 아홉 판이 쓰는 재료가 전부 달라서
  한 번에 다 읽으면 온보딩 화면이 리더보드까지 조회한다.
*/

/** 골든패스 한 칸. 시안 `.gp-i`의 done·now·wait */
export type StepState = "done" | "now" | "wait";

export type HubStep = {
  label: string;
  state: StepState;
  /** 오른쪽 끝 칩(시안 h1의 「대기」, h3의 「24명」) */
  chip?: string;
  /*
    숫자 칩인가. 시안 h3은 그 칩에만 `mono`를 붙여 자릿수를 고정한다
    (h1의 「대기」에는 없다).
  */
  chipMono?: boolean;
};

export type HubView =
  | { pane: "onboarding"; steps: HubStep[]; teamReady: boolean }
  | { pane: "s1"; steps: HubStep[]; dueAt: Date | null }
  | { pane: "s2"; steps: HubStep[]; dueAt: Date | null }
  | {
      pane: "gate1";
      landingUrl: string | null;
      visitors: number;
      leads: number;
      conversion: number | null;
    }
  | {
      pane: "s3";
      steps: HubStep[];
      hostname: string | null;
      verified: boolean;
    }
  | {
      pane: "race";
      validUsers: number;
      rank: number | null;
      teams: number;
      today: number | null;
      shareUrl: string | null;
    }
  | {
      pane: "gate2";
      validUsers: number;
      revenue: bigint;
      announceAt: Date | null;
      /*
        참고 지표 — 채점 축이 아니라 아직 무엇을 셀지 정해지지 않았다
        (PLN6 6장 1번). 값이 없으면 화면이 「—」로 둔다.
      */
      weeklyActive: number | null;
      retention: number | null;
    }
  | {
      pane: "awarded";
      rank: number | null;
      teams: number;
      teamName: string;
      validUsers: number;
      award: string | null;
    }
  | {
      pane: "archived";
      rank: number | null;
      teams: number;
      validUsers: number;
      submitted: number;
      stages: number;
      gatesPassed: number;
      gates: number;
    }
  /* ── 예외 여덟 ─────────────────────────────────────────── */
  | { pane: "late"; steps: HubStep[]; teamReady: boolean; dueAt: Date | null }
  | { pane: "missed"; gate: StageKey }
  | {
      pane: "gateFail";
      gate: StageKey;
      /** 판정에 남은 사유. 운영이 안 적었으면 없다 */
      reason: string | null;
      /** 이의신청 마감 — 판정 통지일 + 5영업일(제11조 ①) */
      appealBy: Date | null;
    }
  | { pane: "undeployed"; validUsers: number; rank: number | null }
  | {
      pane: "disqualified";
      /** 제재 사유. 제재 행이 없으면 없다 */
      reason: string | null;
    }
  | {
      pane: "s5";
      validUsers: number;
      revenue: bigint;
      weeklyActive: number | null;
      retention: number | null;
    };

/*
  골든패스 칸을 만든다.

  기본은 **미체크 중 첫 칸 하나만 `now`**다 — 순서가 있는 길이라(만들어야
  배포한다) 시안 h1·h2·h5가 그렇게 칠려 있다.

  `parallel`을 준 판은 남은 칸이 **함께** 진행 중이다. 시안 h3이 그렇고,
  「알리기」와 「모으기」가 서로를 부르는 일이라서다(content/hub.ts 주석).
  **마지막 칸은 제출 그 자체라** 어느 쪽이든 앞이 다 끝나야 `now`가 된다.
*/
function steps(
  items: { label: string; done: boolean; chip?: string; chipMono?: boolean }[],
  options: { parallel?: boolean } = {},
): HubStep[] {
  const last = items.length - 1;
  const restDone = items.slice(0, last).every((item) => item.done);
  let marked = false;
  return items.map((item, i) => {
    const base = { label: item.label, chip: item.chip, chipMono: item.chipMono };
    if (item.done) return { ...base, state: "done" };
    if (i === last) return { ...base, state: restDone ? "now" : "wait" };
    if (options.parallel) return { ...base, state: "now" };
    if (marked) return { ...base, state: "wait" };
    marked = true;
    return { ...base, state: "now" };
  });
}

/** 저장된 payload에서 가이드 체크 배열만 꺼낸다. 없으면 전부 미체크다 */
function guideChecks(payload: unknown, count: number): boolean[] {
  const raw =
    payload && typeof payload === "object"
      ? (payload as { guideChecks?: unknown }).guideChecks
      : null;
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: count }, (_, i) => list[i] === true);
}

function stringField(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boolList(payload: unknown, key: string): boolean[] {
  if (!payload || typeof payload !== "object") return [];
  const value = (payload as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.map((v) => v === true) : [];
}

/** 그 스테이지에 저장된 것 한 건(임시저장이든 제출이든) */
async function stageDraft(entryId: string, stageKey: StageKey) {
  return prisma.submission.findFirst({
    where: { entryId, stageKey },
    orderBy: { updatedAt: "desc" },
    select: { payload: true, status: true },
  });
}

/**
 * 그 스테이지의 마감. 참가 기록이 없는 화면(시안 h10)도 이것만 따로 읽는다.
 */
export async function stageDueAt(
  seasonId: string,
  stageKey: StageKey,
): Promise<Date | null> {
  const stage = await prisma.stage.findUnique({
    where: { seasonId_stageKey: { seasonId, stageKey } },
    select: { closesAt: true },
  });
  return stage?.closesAt ?? null;
}

/*
  참고 지표 — 가장 최근 하루치를 키별로 준다.

  ⚠️ **무엇을 참고 지표로 셀지는 아직 정해지지 않았다**(PLN6 6장 1번).
  정의 행이 없으면 값도 없고, 화면은 그때 「—」를 그린다 — 지어내지 않는다.
*/
async function loadExtra(
  entryId: string,
): Promise<Record<string, number | null>> {
  const rows = await prisma.metricExtraDaily.findMany({
    where: { entryId },
    orderBy: { metricDate: "desc" },
    select: { value: true, definition: { select: { key: true } } },
  });
  const out: Record<string, number | null> = {
    weekly_active: null,
    retention: null,
  };
  for (const row of rows) {
    const key = row.definition.key;
    if (out[key] === null) out[key] = Number(row.value);
  }
  return out;
}

/** 그날의 끝(서울 23:59). 이의신청 기한이 「그날 이내」라서다 */
function endOfSeoulDay(at: Date): Date {
  return new Date(seoulDateOnly(at).getTime() + (24 * 60 - 9 * 60 - 1) * 60_000);
}

/** 그 참가작의 누적 지표. 리더보드에 행이 없을 때도 쓴다 */
async function totals(entryId: string) {
  const sum = await prisma.metricDaily.aggregate({
    where: { entryId },
    _sum: { validVisitors: true, signups: true, revenue: true },
  });
  return {
    validVisitors: sum._sum.validVisitors ?? 0,
    signups: sum._sum.signups ?? 0,
    /* `0n` 리터럴은 tsconfig target(ES2017)에서 못 쓴다 — 값은 같다 */
    revenue: sum._sum.revenue ?? BigInt(0),
  };
}

/**
 * 내 행과 참가팀 수. 순위·증감·매출이 전부 여기서 나온다.
 *
 * `loadLeaderboard`는 시즌 전체를 읽지만 참가팀이 열 단위라 무겁지 않고,
 * **순위의 정본이 한 곳뿐이어야 한다**는 것이 더 중요하다.
 */
async function myRow(seasonId: string, entryId: string) {
  const board = await loadLeaderboard(seasonId);
  return { row: board.rows.find((r) => r.entryId === entryId) ?? null, teams: board.rows.length };
}

/**
 * 지난 시즌에 참가한 적이 있는가 — 시안 h17을 그릴지 정한다.
 *
 * 다음 시즌이 열리면 그쪽이 「지금 시즌」이 되어(`getCurrentSeason`) 지난
 * 시즌 참가자는 **이번 시즌 참가 기록이 없는 사람**이 된다. 처음 온 사람과
 * 같은 온보딩 화면을 그리지 않기 위해 한 번 확인한다.
 */
export async function hasPastEntry(
  userId: string,
  seasonId: string,
): Promise<boolean> {
  const past = await prisma.entry.findFirst({
    where: {
      seasonId: { not: seasonId },
      team: { members: { some: { userId } } },
    },
    select: { id: true },
  });
  return past !== null;
}

/**
 * 판을 고르는 데만 필요한 축. **판을 고르기 전**이라 이것만 먼저 읽는다.
 *
 * 나머지 재료는 판이 정해진 뒤 `loadHub`가 읽는다 — 아홉 판이 쓰는 것이 전부
 * 달라서, 한 번에 다 읽으면 온보딩 화면이 리더보드까지 조회한다.
 *
 * ⚠️ 둘 다 **그 상태일 때만** 읽는다. 지금 스테이지는 레이스에서만 판을 가르고
 * (h6 vs h15), 판정은 탈락일 때만 판을 가른다(h11 vs h12).
 */
export async function loadHubAxes(viewer: ViewerState): Promise<{
  stageNow: StageKey | null;
  gateFailed: boolean;
}> {
  const { season, entry } = viewer;
  if (!season || !entry) return { stageNow: null, gateFailed: false };

  const [stages, fails] = await Promise.all([
    isRacing(season.phase)
      ? prisma.stage.findMany({
          where: { seasonId: season.id },
          orderBy: { stageKey: "asc" },
          select: { stageKey: true, opensAt: true },
        })
      : Promise.resolve([]),
    entry.status === EntryStatus.eliminated
      ? prisma.judgment.count({
          where: {
            submission: { entryId: entry.id },
            result: JudgmentResult.fail,
          },
        })
      : Promise.resolve(0),
  ]);

  /* 「지금 스테이지」의 정의는 헤더와 한 곳이다 — 창이 열린 것 중 마지막 */
  const now = currentStage(
    stages.map((s) => ({
      key: s.stageKey,
      name: "",
      isGate: false,
      opensAt: s.opensAt,
      closesAt: null,
    })),
    devNow(),
  );
  return { stageNow: now?.key ?? null, gateFailed: fails > 0 };
}

export async function loadHub(
  viewer: ViewerState,
  pane: HubPane,
): Promise<HubView> {
  const { season, entry, team, onboarding } = viewer;
  /* 판을 고를 때 이미 본 것들이다. 타입을 좁히려고 한 번 더 막는다 */
  if (!season || !entry || !team) throw new Error("허브 재료를 읽을 수 없다");

  switch (pane) {
    case "onboarding": {
      const list = steps([
        { label: HUB_ONBOARDING.items[0], done: onboarding.teamReady },
        { label: HUB_ONBOARDING.items[1], done: onboarding.measurementReady },
      ]);
      /* 시안 h1은 끝나지 않은 칸에만 칩을 단다 */
      return {
        pane,
        teamReady: onboarding.teamReady,
        steps: list.map((step) =>
          step.state === "done"
            ? step
            : { ...step, chip: HUB_STEP_CHIP[step.state] },
        ),
      };
    }

    case "s1": {
      const gp = HUB_GOLDEN_PATH.s1;
      const [draft, dueAt] = await Promise.all([
        stageDraft(entry.id, StageKey.s1),
        stageDueAt(season.id, StageKey.s1),
      ]);
      const checks = guideChecks(draft?.payload, gp.checks.length);
      return {
        pane,
        dueAt,
        steps: steps([
          ...gp.checks.map((label, i) => ({ label, done: checks[i] })),
          { label: gp.last, done: false },
        ]),
      };
    }

    case "s2": {
      const gp = HUB_GOLDEN_PATH.s2;
      const [draft, dueAt, leads] = await Promise.all([
        stageDraft(entry.id, StageKey.s2),
        stageDueAt(season.id, StageKey.s2),
        /* 시안 h3이 세 번째 칸에 다는 「24명」. 미인증 리드는 점수에 안 들어간다 */
        prisma.entryLead.count({
          where: { entryId: entry.id, verifiedAt: { not: null } },
        }),
      ]);
      const checks = guideChecks(draft?.payload, gp.checks.length);
      return {
        pane,
        dueAt,
        steps: steps([
          ...gp.checks.map((label, i) => ({
            label,
            done: checks[i],
            chip: i === 2 ? `${leads}명` : undefined,
            chipMono: i === 2,
          })),
          { label: gp.last, done: false },
        ], { parallel: gp.parallel }),
      };
    }

    case "gate1": {
      const [submission, leads, sum] = await Promise.all([
        stageDraft(entry.id, StageKey.s2),
        prisma.entryLead.count({
          where: { entryId: entry.id, verifiedAt: { not: null } },
        }),
        totals(entry.id),
      ]);
      /* 리드를 따로 세지 못한 구간에서는 집계된 가입 수가 같은 값을 든다 */
      const applicants = leads || sum.signups;
      /*
        시안 h4는 주소를 호스트만 적는다(「little-potion.proovit.kr」). 저장된
        것은 전체 주소라 여기서 줄인다 — 줄이지 못하면 적힌 그대로 둔다.
      */
      const landing = stringField(submission?.payload, "landingUrl");
      let landingUrl = landing;
      if (landing) {
        try {
          landingUrl = new URL(landing).host;
        } catch {
          landingUrl = landing;
        }
      }
      return {
        pane,
        landingUrl,
        visitors: sum.validVisitors,
        leads: applicants,
        conversion: conversionRate(applicants, sum.validVisitors),
      };
    }

    case "s3": {
      const gp = HUB_GOLDEN_PATH.s3;
      const [draft, host] = await Promise.all([
        stageDraft(entry.id, StageKey.s3),
        prisma.hostname.findUnique({
          where: { entryId: entry.id },
          select: { hostname: true, ownershipVerifiedAt: true },
        }),
      ]);
      const payload = draft?.payload;
      const launch = boolList(payload, "launchChecks");
      const ai = boolList(payload, "aiChecks");
      const aiFeature =
        payload && typeof payload === "object"
          ? (payload as { aiFeature?: unknown }).aiFeature === true
          : false;
      const verified = host?.ownershipVerifiedAt !== null && host !== null;
      /*
        ⚠️ s3은 폼의 모양이 달라 가이드 체크 배열 하나로 1:1이 되지 않는다.
        칸마다 대응시킨 것이 아래다 — 빌더를 골랐는가, 가입 흐름을 붙였는가,
        배포한 주소를 적었는가, 출시 전 점검을 다 눌렀는가.
        점검은 A1~A10이 전부이고, 생성형 AI 기능이 있으면 B1~B5도 함께다.

        ⚠️ **「배포하고 주소 연결하기」를 측정 연동 검증에 붙이지 않는다.**
        그건 온보딩에서 이미 끝난 일이라 s3에서는 늘 완료가 되어, 앞 칸이
        진행 중인데 뒷 칸이 ✓인 화면이 나온다(2026-09-21에 수연이 잡았다).
        시안 h5도 그 칸은 대기인 채로 아래 요약에 「측정 연동, 검증됨 ✓」를
        따로 둔다 — 둘은 다른 일이다.
      */
      const signupConnected =
        payload && typeof payload === "object"
          ? (payload as { signupConnected?: unknown }).signupConnected === true
          : false;
      return {
        pane,
        hostname: host?.hostname ?? null,
        verified,
        steps: steps([
          {
            label: gp.checks[0],
            done: stringField(payload, "builder") !== null,
          },
          { label: gp.checks[1], done: signupConnected },
          {
            label: gp.checks[2],
            done: stringField(payload, "serviceUrl") !== null,
          },
          {
            label: gp.last,
            done:
              launch.length > 0 &&
              launch.every(Boolean) &&
              (!aiFeature || (ai.length > 0 && ai.every(Boolean))),
          },
        ]),
      };
    }

    case "race": {
      const [{ row, teams }, host, sum] = await Promise.all([
        myRow(season.id, entry.id),
        prisma.hostname.findUnique({
          where: { entryId: entry.id },
          select: { hostname: true },
        }),
        totals(entry.id),
      ]);
      return {
        pane,
        validUsers: row?.validVisitors ?? sum.validVisitors,
        rank: row?.rank ?? null,
        teams,
        today: row?.deltaVisitors ?? null,
        shareUrl: host ? `https://${host.hostname}` : null,
      };
    }

    case "gate2": {
      const [{ row }, sum, seasonRow, extra] = await Promise.all([
        myRow(season.id, entry.id),
        totals(entry.id),
        prisma.season.findUnique({
          where: { id: season.id },
          select: { endsAt: true },
        }),
        loadExtra(entry.id),
      ]);
      return {
        pane,
        validUsers: row?.validVisitors ?? sum.validVisitors,
        revenue: row?.revenue ?? sum.revenue,
        /* 랜딩 ④의 「시상 발표」와 같은 값이다 */
        announceAt: seasonRow?.endsAt ?? null,
        weeklyActive: extra.weekly_active,
        retention: extra.retention,
      };
    }

    case "awarded": {
      const [{ row, teams }, sum] = await Promise.all([
        myRow(season.id, entry.id),
        totals(entry.id),
      ]);
      return {
        pane,
        rank: row?.rank ?? null,
        teams,
        teamName: team.name,
        validUsers: row?.validVisitors ?? sum.validVisitors,
        /* 수상은 운영이 `awards`에 남긴 것만이다 — 순위에서 유추하지 않는다 */
        award: row?.award?.label ?? null,
      };
    }

    case "archived": {
      const [{ row, teams }, sum, stages, submitted, judgments] =
        await Promise.all([
          myRow(season.id, entry.id),
          totals(entry.id),
          prisma.stage.findMany({
            where: { seasonId: season.id },
            select: { stageKey: true, isGate: true },
          }),
          prisma.submission.count({
            where: {
              entryId: entry.id,
              status: { not: SubmissionStatus.draft },
            },
          }),
          /* 판정은 제출에 달린다 — 참가작으로 바로 세지 못한다 */
          prisma.judgment.findMany({
            where: { submission: { entryId: entry.id } },
            select: { result: true },
          }),
        ]);
      return {
        pane,
        rank: row?.rank ?? null,
        teams,
        validUsers: row?.validVisitors ?? sum.validVisitors,
        submitted,
        stages: stages.length,
        gatesPassed: judgments.filter((j) => j.result === JudgmentResult.pass)
          .length,
        gates: stages.filter((s) => s.isGate).length,
      };
    }

    /* ── 예외 여덟 ───────────────────────────────────────── */

    case "late": {
      /*
        온보딩은 h1과 같은 두 칸이다. **칩만 없다** — 시안 h10은 경고줄이
        이미 급하다고 말해 놓고 칸을 「진행 중 / 대기」로 또 설명하지 않는다.
      */
      const list = steps([
        { label: HUB_ONBOARDING.items[0], done: onboarding.teamReady },
        { label: HUB_ONBOARDING.items[1], done: onboarding.measurementReady },
      ]);
      return {
        pane,
        steps: list,
        teamReady: onboarding.teamReady,
        dueAt: await stageDueAt(season.id, StageKey.s1),
      };
    }

    case "missed":
      /* 게이트는 둘뿐이고, 멈춘 자리가 곧 떨어진 자리다(header-read와 같은 규칙) */
      return {
        pane,
        gate: entry.stage === EntryStage.s5 ? StageKey.s5 : StageKey.s2,
      };

    case "gateFail": {
      const gate =
        entry.stage === EntryStage.s5 ? StageKey.s5 : StageKey.s2;
      const [judgment, leads, sum] = await Promise.all([
        prisma.judgment.findFirst({
          where: {
            submission: { entryId: entry.id, stageKey: gate },
            result: JudgmentResult.fail,
          },
          orderBy: { judgedAt: "desc" },
          select: { feedback: true, judgedAt: true },
        }),
        prisma.entryLead.count({
          where: { entryId: entry.id, verifiedAt: { not: null } },
        }),
        totals(entry.id),
      ]);
      /*
        사유 요지 — 시안 h12는 「수요 신호 부족 (신청 3명, 전환율 0.8%)」다.
        괄호 안은 운영이 적는 것이 아니라 **1차 게이트가 본 숫자**라(h4와 같은
        재료) 화면이 붙인다. 2차 게이트는 수요 숫자가 근거가 아니라 안 붙인다.
      */
      const applicants = leads || sum.signups;
      const rate = conversionRate(applicants, sum.validVisitors);
      const numbers =
        gate === StageKey.s2
          ? ` (신청 ${applicants}명, 전환율 ${rate === null ? "—" : `${rate}%`})`
          : "";
      return {
        pane,
        gate,
        reason: judgment?.feedback ? `${judgment.feedback}${numbers}` : null,
        /*
          제11조 ① — 통지 후 5영업일. **기산점은 판정 시각**이고 공휴일은 못
          세므로(appeal.ts 주석) 실제 기한은 이 값보다 늦어질 수 있다.
          마감은 그날 **23:59(서울)**이다 — 「이내」의 끝은 그날 끝이다.
        */
        appealBy: judgment
          ? endOfSeoulDay(addBusinessDays(judgment.judgedAt, APPEAL_BUSINESS_DAYS))
          : null,
      };
    }

    case "undeployed": {
      /*
        ⚠️ **숫자를 0으로 박지 않는다.** 시안 h13이 0과 「-」를 적은 것은
        미배포 팀에 집계가 쌓일 수 없기 때문이지(`public-read.ts`의
        `notDeployed`) 화면이 0을 쓰기 때문이 아니다. 읽어서 그린다.
      */
      const [{ row }, sum] = await Promise.all([
        myRow(season.id, entry.id),
        totals(entry.id),
      ]);
      return {
        pane,
        validUsers: row?.validVisitors ?? sum.validVisitors,
        rank: row?.rank ?? null,
      };
    }

    case "disqualified": {
      const sanction = await prisma.sanction.findFirst({
        where: { entryId: entry.id, stage: SanctionStage.disqualified },
        orderBy: { createdAt: "desc" },
        select: { reason: true },
      });
      return { pane, reason: sanction?.reason ?? null };
    }

    case "s5": {
      const [{ row }, sum, extra] = await Promise.all([
        myRow(season.id, entry.id),
        totals(entry.id),
        loadExtra(entry.id),
      ]);
      return {
        pane,
        validUsers: row?.validVisitors ?? sum.validVisitors,
        revenue: row?.revenue ?? sum.revenue,
        weeklyActive: extra.weekly_active,
        retention: extra.retention,
      };
    }
  }
}
