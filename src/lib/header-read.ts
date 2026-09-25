import { cache } from "react";

import { cookies } from "next/headers";

import {
  AbuseStatus,
  DeployStatus,
  EntryStage,
  EntryStatus,
  SanctionStage,
  SeasonPhase,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { isOnboardingComplete, loadViewerState, type ViewerState } from "@/lib/access";
import { landingVisitors } from "@/lib/ga4";
import {
  conversionRate,
  initialOf,
  nextSeasonLabel,
  resolveAdminHeader,
  resolveDashboardHeader,
  STRIP_COOKIE,
  toHeaderUser,
  type AdminHeaderModel,
  type DashboardHeaderModel,
  type HeaderViewer,
  type StageInfo,
} from "@/lib/header-state";
import { prisma } from "@/lib/prisma";
import { devNow } from "@/lib/dev-clock";
import { getCurrentSeason, publicHeaderSeason } from "@/lib/season";
import { participantStages } from "@/lib/submission";

/*
  세 헤더의 **재료를 모으는 곳.** 판정은 header-state.ts(순수), 그리기는
  NavBar·DashboardTop·AdminTop이 한다. 여기는 DB에서 읽어 판정 입력으로
  바꾸는 다리다.

  `loadViewerState`가 React cache라 레이아웃과 페이지가 각각 불러도 요청당
  DB는 한 번이다. 여기서 더 읽는 것(미읽음 수·스테이지 일정·제재)은 헤더만
  쓰는 값이라 이 파일에 둔다 — ViewerState를 넓히면 판정용 컨텍스트까지
  같이 무거워진다.
*/

/** 심사 회신 SLA(시간). 심사 기준서 v0.3의 48시간 대칭 */
const REVIEW_SLA_HOURS = 48;


/** 미읽음 알림 수. 벨의 점이 이것으로 켜진다 */
async function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/**
 * 세션을 읽은 화면이 공개 헤더에 넘기는 유저 축. 비로그인이면 null.
 *
 * ⚠️ ISR 화면(랜딩)에서는 부르지 않는다 — `auth()`가 쿠키를 읽어 페이지가
 * 동적으로 바뀐다. 그쪽은 NavBar가 `/api/v1/me`로 채운다.
 */
export const loadHeaderViewer = cache(async function loadHeaderViewer(): Promise<HeaderViewer | null> {
  const viewer = await loadViewerState();
  if (!viewer.user) return null;
  const kind = toHeaderUser(viewer);
  if (kind === "guest") return null;
  const unread =
    viewer.season?.flags.notifications && viewer.entry
      ? await countUnread(viewer.user.id)
      : 0;
  return { kind, initial: initialOf(viewer.user.nickname), unread };
});

/**
 * 동적 공개 화면의 한 줄 — `<NavBar {...await loadPublicNav()} />`.
 * 시즌 축과 유저 축을 같이 준다.
 */
export async function loadPublicNav() {
  const [season, viewer] = await Promise.all([getCurrentSeason(), loadHeaderViewer()]);
  return { season: await publicHeaderSeason(season), viewer };
}

// ═════════════════════════════════════════════════════════════
// 참가자 헤더
// ═════════════════════════════════════════════════════════════

/** 달력 그대로(`stages` 행). 운영자 헤더는 이것을 쓴다 — 시즌 권장 일정이다 */
async function loadStages(seasonId: string): Promise<StageInfo[]> {
  const rows = await prisma.stage.findMany({
    where: { seasonId },
    orderBy: { stageKey: "asc" },
    select: { stageKey: true, name: true, isGate: true, opensAt: true, closesAt: true },
  });
  return rows.map((r) => ({
    key: r.stageKey,
    name: r.name,
    isGate: r.isGate,
    opensAt: r.opensAt,
    closesAt: r.closesAt,
  }));
}

/**
 * 다음 시즌. 지금 시즌보다 뒤에 만들어진 것 중 가장 최근.
 *
 * ⚠️ `getCurrentSeason`은 draft가 아닌 것 중 최신을 고르므로, 다음 시즌이
 * 공개되는 순간 그쪽이 「지금 시즌」이 된다. 그때 지난 시즌 참가자의
 * 대시보드는 다른 문제(다중 시즌 조회)라 여기서 다루지 않는다 — 이 조회가
 * 실제로 값을 내는 것은 다음 시즌이 아직 draft일 때다.
 */
async function loadNextSeason(current: { id: string; createdAt: Date }) {
  return prisma.season.findFirst({
    where: { id: { not: current.id }, createdAt: { gt: current.createdAt } },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, phase: true, startsAt: true },
  });
}

/**
 * 참가자 헤더(D1~D9)의 재료. 참가 기록이 없으면 null — 레이아웃이 판정
 * 자리는 아니지만(각 page가 guardPage로 막는다) 그릴 것이 없다.
 */
export async function loadDashboardHeader(
  viewer: ViewerState,
): Promise<DashboardHeaderModel | null> {
  const { user, season, team, entry } = viewer;
  if (!user || !season || !team || !entry) return null;

  const now = devNow();
  const gateKey = entry.stage === EntryStage.s5 ? StageKey.s5 : StageKey.s2;
  const [seasonRow, stages, unread, gateSubmission, sanction, finalSnapshot, members, store, race] =
    await Promise.all([
      prisma.season.findUnique({
        where: { id: season.id },
        select: { createdAt: true, startsAt: true, endsAt: true },
      }),
      loadStages(season.id),
      season.flags.notifications ? countUnread(user.id) : Promise.resolve(0),
      /*
        게이트 제출 — 심사 중이면 SLA 기산점, 탈락이면 사유(미제출/미통과).
        지금 멈춘 게이트 스테이지의 제출 한 건이다.
      */
      entry.stage === EntryStage.s2 || entry.stage === EntryStage.s5 || entry.status === EntryStatus.eliminated
        ? prisma.submission.findFirst({
            where: { entryId: entry.id, stageKey: gateKey, status: SubmissionStatus.submitted },
            orderBy: { submittedAt: "desc" },
            select: { submittedAt: true },
          })
        : Promise.resolve(null),
      entry.status === EntryStatus.disqualified
        ? prisma.sanction.findFirst({
            where: { entryId: entry.id, stage: SanctionStage.disqualified },
            orderBy: { createdAt: "desc" },
            select: { reason: true, appealDeadlineAt: true, appealedAt: true },
          })
        : Promise.resolve(null),
      prisma.leaderboardSnapshot.findFirst({
        where: { entryId: entry.id, isFinal: true },
        orderBy: { snapshotDate: "desc" },
        select: { rank: true },
      }),
      prisma.teamMember.count({ where: { teamId: team.id } }),
      cookies(),
      /* s4 주차의 기산일 — 팀의 레이스 시작(race.ts `raceWeekBase`) */
      prisma.entry.findUnique({ where: { id: entry.id }, select: { raceStartedAt: true } }),
    ]);

  const nextSeasonRow = seasonRow ? await loadNextSeason({ id: season.id, createdAt: seasonRow.createdAt }) : null;

  return resolveDashboardHeader({
    now,
    season: {
      title: season.title,
      slug: season.slug,
      phase: season.phase,
      startsAt: seasonRow?.startsAt ?? null,
      endsAt: seasonRow?.endsAt ?? null,
      flags: {
        notifications: season.flags.notifications,
        leaderboard: season.flags.leaderboard,
      },
    },
    team: { name: team.name, members },
    entry: { stage: entry.stage, status: entry.status },
    onboardingComplete: isOnboardingComplete(viewer.onboarding),
    /*
      실제 창(유동 게이트, submission.ts `participantStages`). 운영자 헤더는 달력 그대로다.
      s4 마감(그 주차의 끝)은 팀의 레이스 시작부터 센다 — 제출 화면 「이번 주 마감」과 같은 값.
    */
    stages: participantStages(stages, now, race?.raceStartedAt ?? null),
    gateSubmittedAt: gateSubmission?.submittedAt ?? null,
    reviewSlaHours: REVIEW_SLA_HOURS,
    finalRank: finalSnapshot?.rank ?? null,
    /* 게이트 스테이지(s2·s5)에 멈춰 있을 때만 사유를 안다. 그 밖(운영자 수동 탈락)은 null */
    elimination:
      entry.status === EntryStatus.eliminated &&
      (entry.stage === EntryStage.s2 || entry.stage === EntryStage.s5)
        ? { gate: gateKey, submitted: gateSubmission !== null }
        : null,
    sanction: sanction
      ? { reason: sanction.reason, appealDeadlineAt: sanction.appealDeadlineAt, appealedAt: sanction.appealedAt }
      : null,
    unread,
    initial: initialOf(user.nickname),
    nextSeason: nextSeasonRow
      ? {
          label: nextSeasonRow.title || nextSeasonLabel(season.title),
          startsAt: nextSeasonRow.startsAt,
          recruiting: nextSeasonRow.phase === SeasonPhase.recruiting,
        }
      : null,
    stripDismissed: store.get(STRIP_COOKIE)?.value === entry.id,
  });
}

// ═════════════════════════════════════════════════════════════
// 운영자 헤더
// ═════════════════════════════════════════════════════════════

/**
 * 운영자 헤더(A1~A7)의 재료. 대기열 숫자는 **운영자에게만** 읽는다 —
 * 레이아웃은 /admin 아래 모든 요청에서 돌고, 비운영자는 page가 404를 내지만
 * 그 전에 숫자를 읽어 둘 이유가 없다.
 */
export async function loadAdminHeader(viewer: ViewerState): Promise<AdminHeaderModel | null> {
  const { user } = viewer;
  if (!user || !user.roles.includes("admin")) return null;

  const now = devNow();
  const [seasons, email] = await Promise.all([
    prisma.season.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, phase: true, startsAt: true, endsAt: true, createdAt: true },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { email: true } }),
  ]);

  /* 운영자는 draft 시즌도 본다. 셀렉트 기본은 공개 시즌(뷰어의 시즌) */
  const season = seasons.find((s) => s.id === viewer.season?.id) ?? seasons[0] ?? null;
  if (!season) {
    return resolveAdminHeader({
      now, season: null, seasons: [], stages: [], recruitDeadline: null,
      queues: EMPTY_QUEUES, nextSeason: null, email: email?.email ?? "",
    });
  }

  const stages = await loadStages(season.id);
  const gateKeys = stages.filter((s) => s.isGate).map((s) => s.key);
  const current = stages.filter((s) => s.opensAt && s.opensAt <= now).at(-1) ?? stages[0] ?? null;
  const slaEdge = new Date(now.getTime() - (REVIEW_SLA_HOURS - 12) * 3_600_000);
  const nextSeasonRow = seasons.find((s) => s.createdAt > season.createdAt) ?? null;

  const [
    leads, entries, onboardingIncomplete, stagePending, reviewsPending, reviewsSlaUnder12h,
    metricsPending, abuseFlags, appealsPending, nextSeasonLeads, recruitSchedule,
  ] = await Promise.all([
    prisma.lead.count({ where: { seasonId: season.id } }),
    prisma.entry.count({ where: { seasonId: season.id } }),
    /* 신청은 했는데 온보딩(측정 연동 검증)을 못 마친 팀 */
    prisma.entry.count({
      where: {
        seasonId: season.id,
        status: EntryStatus.active,
        stage: EntryStage.applied,
        OR: [
          { hostname: null },
          { hostname: { OR: [{ ownershipVerifiedAt: null }, { deployStatus: { not: DeployStatus.active } }] } },
        ],
      },
    }),
    current
      ? current.key === StageKey.s3
        ? /* s3의 대기열은 제출이 아니라 배포 URL 검증이다 */
          prisma.hostname.count({
            where: {
              entry: { seasonId: season.id, status: EntryStatus.active },
              deployStatus: { in: [DeployStatus.pending, DeployStatus.verifying] },
            },
          })
        : prisma.submission.count({
            where: {
              entry: { seasonId: season.id },
              stageKey: current.key,
              status: SubmissionStatus.submitted,
              judgments: { none: {} },
            },
          })
      : Promise.resolve(0),
    gateKeys.length
      ? prisma.submission.count({
          where: {
            entry: { seasonId: season.id },
            stageKey: { in: gateKeys },
            status: SubmissionStatus.submitted,
            judgments: { none: {} },
          },
        })
      : Promise.resolve(0),
    gateKeys.length
      ? prisma.submission.count({
          where: {
            entry: { seasonId: season.id },
            stageKey: { in: gateKeys },
            status: SubmissionStatus.submitted,
            judgments: { none: {} },
            submittedAt: { lt: slaEdge },
          },
        })
      : Promise.resolve(0),
    /* 집계 확정 대기 = 아직 최종 스냅샷이 없는 활성 팀 */
    prisma.entry.count({
      where: { seasonId: season.id, status: EntryStatus.active, snapshots: { none: { isFinal: true } } },
    }),
    prisma.abuseFlag.count({ where: { entry: { seasonId: season.id }, status: AbuseStatus.flagged } }),
    prisma.appeal.count({ where: { entry: { seasonId: season.id }, respondedAt: null } }),
    nextSeasonRow
      ? prisma.lead.count({ where: { seasonId: nextSeasonRow.id } })
      : Promise.resolve(null),
    /* 참가 신청 마감 = 레이스로 넘어가는 예정 시각 */
    prisma.seasonSchedule.findFirst({
      where: { seasonId: season.id, phase: SeasonPhase.racing },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    }),
  ]);

  /*
    전환율(A1)의 분모 — 랜딩 방문자. 모집 전에만 헤더에 나오므로 그때만 GA4를
    부른다. 기간은 사전 신청이 열린 때부터(season_schedules의 pre_apply 행,
    없으면 시즌 생성일). 자격이 없거나 실패하면 null이고 조각을 비운다.
  */
  let leadsConversion: number | null = null;
  if (season.phase === SeasonPhase.pre_apply) {
    const opened = await prisma.seasonSchedule.findFirst({
      where: { seasonId: season.id, phase: SeasonPhase.pre_apply },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    });
    leadsConversion = conversionRate(leads, await landingVisitors(opened?.startsAt ?? season.createdAt));
  }

  return resolveAdminHeader({
    now,
    season: { id: season.id, title: season.title, phase: season.phase, startsAt: season.startsAt, endsAt: season.endsAt },
    seasons: seasons.map((s) => ({ id: s.id, title: s.title, phase: s.phase })),
    stages,
    /* racing 행이 없으면 개막으로 — 개막 = 레이스 시작이라 같은 순간이다(2026-09-26 수연 결정) */
    recruitDeadline: recruitSchedule?.startsAt ?? season.startsAt,
    queues: {
      leads,
      leadsConversion,
      entries,
      onboardingIncomplete,
      stagePending,
      reviewsPending,
      reviewsSlaUnder12h,
      metricsPending,
      abuseFlags,
      appealsPending,
      nextSeasonLeads,
    },
    nextSeason: nextSeasonRow ? { title: nextSeasonRow.title, startsAt: nextSeasonRow.startsAt } : null,
    email: email?.email ?? "",
  });
}

const EMPTY_QUEUES = {
  leads: 0, leadsConversion: null, entries: 0, onboardingIncomplete: 0, stagePending: 0,
  reviewsPending: 0, reviewsSlaUnder12h: 0, metricsPending: 0, abuseFlags: 0, appealsPending: 0,
  nextSeasonLeads: null,
};
