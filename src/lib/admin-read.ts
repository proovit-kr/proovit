import {
  AbuseStatus,
  DeployStatus,
  EntryStage,
  EntryStatus,
  LeadStatus,
  SubmissionStatus,
  type SeasonPhase,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { devNow } from "@/lib/dev-clock";
import { loadFirstRaceStart } from "@/lib/race-read";
import { rollupHalt } from "@/lib/rollup";
import {
  formatLatePassCode,
  lateEntryBlock,
  latePassStatus,
  type LateEntryBlock,
  type LatePassStatus,
} from "@/lib/late-entry";
import { loadLateEntryDeadline } from "@/lib/late-entry-store";

/*
  운영자 콘솔의 조회.

  ⚠️ 여기는 **개인정보가 실제로 보이는 유일한 화면군**이다. 공개 화면(public-read.ts)이
  팀명까지만 보는 것과 반대로, 운영은 리드 이메일과 참가자 닉네임을 본다 —
  통지·검증·정산이 그걸로 굴러가기 때문이다. 그래서 두 파일을 갈라 두었다.
  **공개 화면에서 이 파일을 import하면 그 순간 화이트리스트가 깨진다.**

  실명은 여기서도 읽지 않는다. 실명이 필요한 자리는 입상 확정 후 정산뿐이고
  (운영규칙 제19조 ⑤), 그 화면은 아직 없다.
*/

export type AdminSummary = {
  season: { id: string; title: string; slug: string; phase: string } | null;
  entries: { total: number; active: number; eliminated: number; disqualified: number };
  /** 제출은 됐는데 판정이 안 붙은 건 — 운영이 지금 해야 할 일의 크기다 */
  pendingJudgments: number;
  leads: { total: number; unsubscribed: number; week: number };
  /** 미처리 어뷰징 플래그 */
  openAbuseFlags: number;
  /** 배포 확인이 끝난 참가작 수 — 시안 KPI 3. `week`는 이번 주에 확인된 것 */
  deployed: { total: number; week: number };
  /** 참가작 전체의 유효 방문 합 — 시안 KPI 4. `week`는 최근 7일 몫 */
  visitors: { total: number; week: number };
  /** 답변이 안 나간 소명 */
  openAppeals: number;
  /** 손으로 볼 지표 플래그(수동 검토 미통과) */
  openMetricFlags: number;
  /** 마지막으로 롤업이 돈 시각. 한 번도 안 돌았으면 null */
  lastRollupAt: Date | null;
  /**
   * 가장 이른 레이스 시작 — 롤업이 돌기 시작해야 하는 때(2026-09-26 팀별 집계).
   * 아무 팀도 s3을 안 냈으면 null. 「지연」 판정의 기준이다(race.ts `rollupHealth`).
   */
  firstRaceStartAt: Date | null;
  /** 롤업이 쉬는 시즌인가(레이스·시상 페이즈 밖, 순위 확정 뒤). 쉬면 「지연」을 판정하지 않는다 */
  rollupHalted: boolean;
  /**
    다음 게이트. 시안의 「다음 게이트 배치」 카드가 쓴다 — 마감이 지나지 않은
    게이트 중 가장 이른 것이다. 없으면 null(시즌 전이거나 둘 다 끝났다).
  */
  nextGate: {
    /** 게이트 번호 — s2가 1, s5가 2(시안 「GATE 1」) */
    no: number;
    stageKey: string;
    closesAt: Date | null;
    /** 그 게이트가 판정할 대상 팀 수 */
    targets: number;
  } | null;
  /** 최근 감사 로그 5줄 — 시안 `.minlog` */
  recentAudit: AuditLine[];
};

/** 감사 로그 한 줄 — 대시보드 `.minlog`와 감사 로그 표가 같이 쓴다 */
export type AuditLine = {
  id: string;
  at: Date;
  /** 운영자 표시 — 계정 이메일의 @ 앞, 사람이 아니면 「system」 */
  actor: string;
  action: string;
  /** 대상 이름(팀명·시즌명). 못 찾으면 null */
  target: string | null;
  /** 값이 바뀐 기록이면 「fail→pass」 — 대시보드 줄이 대상 뒤에 붙인다 */
  change: string | null;
  reason: string;
};

/** 최근 7일 — 대시보드 KPI의 「이번 주」 */
const WEEK_MS = 7 * 86_400_000;

async function countPendingJudgments(seasonId: string): Promise<number> {
  const gates = await prisma.stage.findMany({
    where: { seasonId, isGate: true },
    select: { stageKey: true },
  });
  if (gates.length === 0) return 0;

  return prisma.submission.count({
    where: {
      status: SubmissionStatus.submitted,
      stageKey: { in: gates.map((gate) => gate.stageKey) },
      entry: { seasonId },
      judgments: { none: {} },
    },
  });
}

/**
 * 감사 로그 행의 대상 이름을 찾는다.
 *
 * `target_id`는 외래키가 아니라 `target_type`마다 가리키는 표가 다르다. 종류별로
 * 모아서 한 번씩만 읽는다. 대상을 풀어 쓸 수 없는 묶음 작업(게이트 일괄 판정·
 * 전체 공지)은 쓰는 쪽이 `meta.target`에 이름을 적어 둔다 — 그것이 먼저다.
 */
export async function loadAuditLines(
  rows: {
    id: bigint;
    createdAt: Date;
    action: string;
    targetType: string;
    targetId: string | null;
    reason: string;
    meta: unknown;
    actor: { email: string | null } | null;
  }[],
): Promise<AuditLine[]> {
  const ids = (type: string) =>
    [...new Set(rows.filter((r) => r.targetType === type && r.targetId).map((r) => r.targetId!))];
  const metaEntry = (meta: unknown) =>
    meta && typeof meta === "object" && "entryId" in meta && typeof meta.entryId === "string"
      ? meta.entryId
      : null;

  const entryIds = [
    ...ids("entry"),
    ...rows.map((r) => metaEntry(r.meta)).filter((v): v is string => !!v),
  ];
  const [entries, teams, submissions, flags, seasons] = await Promise.all([
    prisma.entry.findMany({
      where: { id: { in: entryIds } },
      select: { id: true, team: { select: { name: true } } },
    }),
    prisma.team.findMany({ where: { id: { in: ids("team") } }, select: { id: true, name: true } }),
    prisma.submission.findMany({
      where: { id: { in: ids("submission") } },
      select: { id: true, entry: { select: { team: { select: { name: true } } } } },
    }),
    prisma.abuseFlag.findMany({
      where: { id: { in: ids("abuse_flag") } },
      select: { id: true, entry: { select: { team: { select: { name: true } } } } },
    }),
    prisma.season.findMany({ where: { id: { in: ids("season") } }, select: { id: true, title: true } }),
  ]);

  const name = new Map<string, string>([
    ...entries.map((e) => [e.id, e.team.name] as const),
    ...teams.map((t) => [t.id, t.name] as const),
    ...submissions.map((s) => [s.id, s.entry.team.name] as const),
    ...flags.map((f) => [f.id, f.entry.team.name] as const),
    ...seasons.map((s) => [s.id, s.title] as const),
  ]);

  return rows.map((row) => {
    const meta = row.meta as { target?: unknown; from?: unknown; to?: unknown } | null;
    const label =
      typeof meta?.target === "string"
        ? meta.target
        : ((row.targetId && name.get(row.targetId)) ??
          (metaEntry(row.meta) ? name.get(metaEntry(row.meta)!) : undefined) ??
          null);
    return {
      id: String(row.id),
      at: row.createdAt,
      actor: row.actor?.email ? row.actor.email.split("@")[0] : "system",
      action: row.action,
      target: label,
      change:
        typeof meta?.from === "string" && typeof meta?.to === "string"
          ? `${meta.from}→${meta.to}`
          : null,
      reason: row.reason,
    };
  });
}

export const AUDIT_SELECT = {
  id: true,
  createdAt: true,
  action: true,
  targetType: true,
  targetId: true,
  reason: true,
  meta: true,
  actor: { select: { email: true } },
} as const;

/** 감사 로그 필터의 액션 묶음 — 시안 네 줄에 우리 화면이 쓰는 앞마디를 더했다 */
export const AUDIT_ACTION_GROUPS = [
  "judgment",
  "entry",
  "metric",
  "abuse",
  "season",
  "notification",
  "lead",
  "award",
  "credit",
] as const;

export type AuditFilter = {
  /** "season"이면 시즌 전체, 아니면 최근 30일 */
  period?: string;
  /** 운영자 id, "system"이면 사람이 아닌 기록 */
  actor?: string;
  /** 액션 앞마디(`judgment` → judgment.*) */
  action?: string;
};

/**
 * 감사 로그 — 시안 `#scr-adm-audit`(3180행). 읽기 전용이다.
 *
 * 옛 기록은 액션 이름이 콜론·밑줄 표기(`judgment:pass`·`entry_status:x`)라 앞마디
 * 필터가 셋을 다 받는다.
 */
export async function loadAuditPage(
  filter: AuditFilter,
  season: { id: string } | null,
  now: Date,
): Promise<{ rows: AuditLine[]; actors: { id: string; name: string }[] }> {
  const since =
    filter.period === "season" && season
      ? ((await prisma.season.findUnique({ where: { id: season.id }, select: { createdAt: true } }))?.createdAt ?? null)
      : new Date(now.getTime() - 30 * 86_400_000);
  const group = (AUDIT_ACTION_GROUPS as readonly string[]).includes(filter.action ?? "")
    ? filter.action!
    : null;

  const [rows, actorRows] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        ...(since ? { createdAt: { gte: since } } : {}),
        ...(filter.actor === "system"
          ? { actorId: null }
          : filter.actor
            ? { actorId: filter.actor }
            : {}),
        ...(group
          ? {
              OR: [".", ":", "_"].map((sep) => ({ action: { startsWith: group + sep } })),
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: AUDIT_SELECT,
    }),
    /*
      「운영자」 고르개에는 운영자만 — 참가자도 감사 로그에 남는다(혜택 받기
      `credit.claim`, 누가 눌렀는지가 근거라서). 그 사람들을 운영자로 늘어놓지 않는다.
    */
    prisma.auditLog.findMany({
      where: {
        actorId: { not: null },
        actor: { userRoles: { some: { role: { key: "admin" } } } },
      },
      distinct: ["actorId"],
      select: { actor: { select: { id: true, email: true } } },
    }),
  ]);

  return {
    rows: await loadAuditLines(rows),
    actors: actorRows
      .filter((r) => r.actor)
      .map((r) => ({ id: r.actor!.id, name: r.actor!.email?.split("@")[0] ?? "운영자" })),
  };
}

/**
 * 마지막으로 롤업이 돈 시각. 롤업은 하루 한 행을 15분마다 덮어쓰므로 가장 나중에
 * 고쳐진 스냅샷 행이 곧 마지막 롤업이다(public-read.ts의 「n분 전 갱신」과 같은 값).
 * 대시보드 부제와 지표 검토의 빈 상태가 같이 쓴다.
 */
export async function loadLastRollup(seasonId: string): Promise<Date | null> {
  const row = await prisma.leaderboardSnapshot.findFirst({
    where: { seasonId },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  return row?.updatedAt ?? null;
}

/** 롤업 주기 — vercel.json의 크론과 같다 */
export const ROLLUP_EVERY_MIN = 15;

/**
 * 롤업이 멈췄는지 — 주기(15분)를 두 번 넘기면 지연으로 본다.
 * 내가 정함(수연 확인 대기): 시안은 「정상」 한 판만 그렸다.
 */
export const ROLLUP_LATE_MIN = 30;

/**
 * 롤업 상태를 가를 재료 셋 — race.ts `rollupHealth`에 그대로 넘긴다.
 * 지표 검토의 빈 상태가 쓴다. 대시보드는 요약(`loadAdminSummary`)에 같은 값을 싣는다.
 */
export async function loadRollupState(seasonId: string): Promise<{
  halted: boolean;
  lastRollupAt: Date | null;
  firstRaceStartAt: Date | null;
}> {
  const season = await prisma.season.findUniqueOrThrow({
    where: { id: seasonId },
    select: { id: true, phase: true },
  });
  const [halt, lastRollupAt, firstRaceStartAt] = await Promise.all([
    rollupHalt(season),
    loadLastRollup(seasonId),
    loadFirstRaceStart(seasonId),
  ]);
  return { halted: halt !== null, lastRollupAt, firstRaceStartAt };
}

/**
 * 운영 대시보드 숫자. **헤더의 시즌 셀렉트와 같은 시즌**을 본다(`viewer.season`).
 * 한때 「가장 최근에 만든 시즌」을 따로 골라서, 다음 시즌 초안을 만들어 두면
 * 헤더는 시즌 1인데 대시보드만 시즌 2를 읽었다.
 */
export async function loadAdminSummary(seasonId: string | null): Promise<AdminSummary> {
  const season = seasonId
    ? await prisma.season.findUnique({
        where: { id: seasonId },
        select: { id: true, title: true, slug: true, phase: true },
      })
    : null;
  if (!season) {
    return {
      season: null,
      entries: { total: 0, active: 0, eliminated: 0, disqualified: 0 },
      pendingJudgments: 0,
      leads: { total: 0, unsubscribed: 0, week: 0 },
      openAbuseFlags: 0,
      deployed: { total: 0, week: 0 },
      visitors: { total: 0, week: 0 },
      openAppeals: 0,
      openMetricFlags: 0,
      lastRollupAt: null,
      firstRaceStartAt: null,
      rollupHalted: true,
      nextGate: null,
      recentAudit: [],
    };
  }

  const now = devNow();
  const weekAgo = new Date(now.getTime() - WEEK_MS);

  const [
    byStatus,
    pendingJudgments,
    leads,
    leadsWeek,
    unsubscribed,
    openAbuseFlags,
    deployedEntries,
    deployedWeek,
    visitorAgg,
    visitorWeek,
    openAppeals,
    openMetricFlags,
    gates,
    lastRollup,
    recentAudit,
    firstRaceStartAt,
    halt,
  ] = await Promise.all([
      prisma.entry.groupBy({
        by: ["status"],
        where: { seasonId: season.id },
        _count: { _all: true },
      }),
      /*
        게이트 스테이지 제출 중 판정이 하나도 안 붙은 것.

        ⚠️ `submissions`에는 `stages`로 가는 관계가 없다 — `stage_key`가 ENUM이라
        외래키가 아니다. 그래서 게이트 스테이지 키를 먼저 읽어 `in`으로 건다.
        관계인 줄 알고 `stage: { isGate: true }`로 쓰면 타입에서 걸린다.
      */
      countPendingJudgments(season.id),
      prisma.lead.count({ where: { seasonId: season.id } }),
      prisma.lead.count({ where: { seasonId: season.id, createdAt: { gte: weekAgo } } }),
      prisma.lead.count({
        where: { seasonId: season.id, status: LeadStatus.unsubscribed },
      }),
      prisma.abuseFlag.count({
        where: { entry: { seasonId: season.id }, status: "flagged" },
      }),
      /* 배포 확인이 끝난 참가작 — 시안 KPI 3 「배포 완료 서비스」 */
      prisma.hostname.count({
        where: { entry: { seasonId: season.id }, deployStatus: DeployStatus.active },
      }),
      /* 그중 이번 주에 소유 확인이 끝난 것 — 「↑ 2 이번 주」 */
      prisma.hostname.count({
        where: {
          entry: { seasonId: season.id },
          deployStatus: DeployStatus.active,
          ownershipVerifiedAt: { gte: weekAgo },
        },
      }),
      /* 참가작 전체 유효 방문 합 — 시안 KPI 4 「참가작 총 이용자」 */
      prisma.metricDaily.aggregate({
        where: { entry: { seasonId: season.id } },
        _sum: { validVisitors: true },
      }),
      prisma.metricDaily.aggregate({
        where: { entry: { seasonId: season.id }, metricDate: { gte: weekAgo } },
        _sum: { validVisitors: true },
      }),
      /* 답변이 안 나간 소명 */
      prisma.appeal.count({
        where: { entry: { seasonId: season.id }, respondedAt: null },
      }),
      /*
        손으로 볼 지표 — `/admin/metrics`가 큐에 올리는 것과 같은 조건이다.
        여기 숫자와 그 화면의 줄 수가 어긋나면 운영이 둘 중 뭘 믿을지 모른다.
      */
      prisma.metricDaily.count({
        where: { entry: { seasonId: season.id }, manualReviewPassed: false },
      }),
      /* 게이트는 둘뿐이라 다 읽고 고른다 */
      prisma.stage.findMany({
        where: { seasonId: season.id, isGate: true },
        select: { stageKey: true, closesAt: true },
        orderBy: { stageKey: "asc" },
      }),
      loadLastRollup(season.id),
      /*
        시안 `.minlog` — 다섯 줄. 운영 쓰기만 — 참가자의 혜택 받기(`credit.claim`)는
        팀 수만큼 쌓여 운영자가 한 일을 밀어낸다. 감사 로그 화면과 스폰서 발송 이력에는 있다.
      */
      prisma.auditLog.findMany({
        where: { action: { not: "credit.claim" } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: AUDIT_SELECT,
      }),
      loadFirstRaceStart(season.id),
      rollupHalt(season),
]);

  const count = (status: EntryStatus) =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0;

  return {
    season,
    entries: {
      total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      active: count(EntryStatus.active),
      eliminated: count(EntryStatus.eliminated),
      disqualified: count(EntryStatus.disqualified),
    },
    pendingJudgments,
    leads: { total: leads, unsubscribed, week: leadsWeek },
    deployed: { total: deployedEntries, week: deployedWeek },
    visitors: {
      total: visitorAgg._sum.validVisitors ?? 0,
      week: visitorWeek._sum.validVisitors ?? 0,
    },
    openAppeals,
    openMetricFlags,
    lastRollupAt: lastRollup,
    firstRaceStartAt,
    rollupHalted: halt !== null,
    /*
      마감이 안 지난 게이트 중 가장 이른 것. 마감이 비어 있는 게이트는 일정이
      아직 안 잡힌 것이라 뒤로 미룬다 — 날짜 없는 게이트를 「다음」으로 내세우면
      운영이 SLA를 못 잡는다.
    */
    nextGate: (() => {
      const numbered = gates.map((g, i) => ({ ...g, no: i + 1 }));
      const upcoming = numbered
        .filter((g) => g.closesAt && g.closesAt >= now)
        .sort((a, b) => a.closesAt!.getTime() - b.closesAt!.getTime());
      const pick = upcoming[0] ?? numbered.find((g) => !g.closesAt) ?? null;
      if (!pick) return null;
      return {
        no: pick.no,
        stageKey: pick.stageKey,
        closesAt: pick.closesAt,
        /* 판정 대상은 그 시즌에 살아 있는 팀이다 */
        targets: count(EntryStatus.active),
      };
    })(),
    recentAudit: await loadAuditLines(recentAudit),
    openAbuseFlags,
  };
}

export type AdminEntryRow = {
  id: string;
  teamName: string;
  track: string | null;
  stage: EntryStage;
  status: EntryStatus;
  /** s3 이후인데 배포 확인이 안 된 팀 — 시안의 「미배포」 배지 */
  undeployed: boolean;
  /** 답이 안 나간 소명이 있다 — 시안의 「소명 대기」 배지 */
  appealPending: boolean;
  /** 온보딩 두 단계(팀 구성·측정 연동)가 끝났다. 판정은 access.ts와 같은 식 */
  onboarded: boolean;
  lastSubmittedAt: Date | null;
};

export type AdminEntryFilter = {
  stage?: string;
  status?: string;
  /** "yes" 미처리 어뷰징 플래그가 있는 팀, "no" 없는 팀 */
  flag?: string;
  q?: string;
};

/**
 * 참가 관리 — 시안 `#scr-adm-entries`(3041행).
 *
 * 운영이 이 화면에서 판단하는 것은 「누가 어디까지 왔고 지금 살아 있는가」다.
 * 그래서 진도·생존 상태·온보딩·최근 제출을 한 줄에 같이 둔다.
 */
export async function loadAdminEntries(
  seasonId: string,
  filter: AdminEntryFilter = {},
): Promise<AdminEntryRow[]> {
  const stage = (Object.values(EntryStage) as string[]).includes(filter.stage ?? "")
    ? (filter.stage as EntryStage)
    : undefined;
  const status = (Object.values(EntryStatus) as string[]).includes(filter.status ?? "")
    ? (filter.status as EntryStatus)
    : undefined;
  const openFlag = { some: { status: AbuseStatus.flagged } };

  const entries = await prisma.entry.findMany({
    where: {
      seasonId,
      ...(stage ? { stage } : {}),
      ...(status ? { status } : {}),
      ...(filter.flag === "yes" ? { abuseFlags: openFlag } : {}),
      ...(filter.flag === "no" ? { abuseFlags: { none: { status: AbuseStatus.flagged } } } : {}),
      ...(filter.q ? { team: { name: { contains: filter.q, mode: "insensitive" as const } } } : {}),
    },
    orderBy: [{ status: "asc" }, { appliedAt: "asc" }],
    select: {
      id: true,
      stage: true,
      status: true,
      track: { select: { name: true } },
      team: { select: { name: true, isSolo: true, _count: { select: { members: true } } } },
      hostname: { select: { deployStatus: true, ownershipVerifiedAt: true } },
      appeals: { where: { respondedAt: null }, select: { id: true }, take: 1 },
      submissions: {
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: "desc" },
        take: 1,
        select: { submittedAt: true },
      },
    },
  });

  const AFTER_BUILD: EntryStage[] = [EntryStage.s3, EntryStage.s4, EntryStage.s5, EntryStage.completed];
  return entries.map((entry) => {
    const deployed =
      entry.hostname?.deployStatus === DeployStatus.active &&
      entry.hostname.ownershipVerifiedAt !== null;
    const teamReady = entry.team.isSolo || entry.team._count.members >= 2;
    return {
      id: entry.id,
      teamName: entry.team.name,
      track: entry.track?.name ?? null,
      stage: entry.stage,
      status: entry.status,
      undeployed: AFTER_BUILD.includes(entry.stage) && !deployed,
      appealPending: entry.appeals.length > 0,
      onboarded: teamReady && deployed,
      lastSubmittedAt: entry.submissions[0]?.submittedAt ?? null,
    };
  });
}

export type AdminLatePassRow = {
  id: string;
  /** 저장된 코드 — 링크를 만들 때 쓴다 */
  code: string;
  /** 사람이 읽는 모양 `LTE-XY7K-3MPQ` */
  label: string;
  createdAt: Date;
  expiresAt: Date;
  status: LatePassStatus;
  /** 쓰였으면 그 신청으로 생긴 팀 */
  teamName: string | null;
  reason: string;
};

export type AdminLatePassBoard = {
  /** 지금 링크를 못 만드는 사유. null이면 만들 수 있다 */
  block: LateEntryBlock | null;
  /** s1 달력 마감(s1 구간의 끝) — 편입이 닫히는 때이자 링크 기한의 상한 */
  deadline: Date | null;
  rows: AdminLatePassRow[];
};

/** 참가 관리의 「최근 링크」에 올리는 수. 문의로만 생기는 링크라 이만하면 한 시즌이 다 든다 */
const LATE_PASS_RECENT = 20;

/**
 * 참가 관리의 「지각 편입」 칸(시안에 없는 칸) — 지금 링크를 만들 수 있는가와 최근 링크.
 * 만들 수 있는지는 admin-store `createLatePass`와 같은 `lateEntryBlock`이 가른다.
 */
export async function loadLatePassBoard(
  seasonId: string,
  now: Date,
): Promise<AdminLatePassBoard> {
  const [season, deadline, passes] = await Promise.all([
    prisma.season.findUnique({ where: { id: seasonId }, select: { phase: true } }),
    loadLateEntryDeadline(seasonId),
    prisma.lateEntryPass.findMany({
      where: { seasonId },
      orderBy: { createdAt: "desc" },
      take: LATE_PASS_RECENT,
      select: {
        id: true,
        code: true,
        reason: true,
        createdAt: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        entry: { select: { team: { select: { name: true } } } },
      },
    }),
  ]);

  const block = season ? lateEntryBlock(season.phase, deadline, now) : "PHASE_CLOSED";
  return {
    block,
    deadline,
    rows: passes.map((p) => ({
      id: p.id,
      code: p.code,
      label: formatLatePassCode(p.code),
      createdAt: p.createdAt,
      expiresAt: p.expiresAt,
      /* 기간이 끝났으면 기한이 남았어도 「만료」— 참가자 판정(`latePassFailure`)과 같게 */
      status: latePassStatus(p, now, block),
      teamName: p.entry?.team.name ?? null,
      reason: p.reason,
    })),
  };
}

export type AdminLeadRow = {
  id: string;
  email: string;
  sourceChannel: string | null;
  utmSource: string | null;
  marketingOptIn: boolean;
  unsubscribedAt: Date | null;
  createdAt: Date;
};

/**
 * 사전신청 리드 — 시안 `#scr-adm-leads`(3109행). KPI 1번의 관측 지점이다.
 *
 * 수신거부한 사람도 목록에서 지우지 않는다. 지우면 같은 주소로 다시 발송할 수
 * 있게 되어 수신거부의 뜻이 사라진다. 화면은 마케팅 칸을 「-」로 적는다.
 */
export async function loadAdminLeads(
  seasonId: string,
  today: Date,
  take: number = 200,
): Promise<{ rows: AdminLeadRow[]; total: number; todayCount: number; optIn: number }> {
  /* 「오늘」은 KST 달력일이다 */
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(today);
  const dayStart = new Date(`${ymd}T00:00:00+09:00`);
  const [rows, total, todayCount, optIn] = await Promise.all([
    prisma.lead.findMany({
      where: { seasonId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        email: true,
        sourceChannel: true,
        utmSource: true,
        marketingOptIn: true,
        unsubscribedAt: true,
        createdAt: true,
      },
    }),
    prisma.lead.count({ where: { seasonId } }),
    prisma.lead.count({
      where: { seasonId, createdAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) } },
    }),
    prisma.lead.count({ where: { seasonId, marketingOptIn: true, unsubscribedAt: null } }),
  ]);
  return { rows, total, todayCount, optIn };
}

export type AdminSeasonView = {
  id: string;
  title: string;
  phase: SeasonPhase;
  startsAt: Date | null;
  endsAt: Date | null;
  stages: { stageKey: string; isGate: boolean; opensAt: Date | null; closesAt: Date | null }[];
  tracks: { id: string; name: string }[];
  /** 페이즈 일정(`season_schedules`) — 크론이 읽는 표. 운영 콘솔 「페이즈 일정」 칸 */
  schedules: { phase: SeasonPhase; startsAt: Date; appliedAt: Date | null; note: string | null }[];
  featureFlags: Record<string, unknown>;
  scoringConfig: unknown;
};

/**
 * 시즌 관리 화면 — 헤더의 시즌 셀렉트가 고른 시즌 하나(시안 `#scr-adm-seasons`).
 * 플래그는 JSONB 원본을 그대로 넘긴다 — 스위치가 「명시해서 켬」과 「기본값」을
 * 가르지 않아도 되도록 화면이 `parseFeatureFlags`로 읽는다.
 */
export async function loadAdminSeason(seasonId: string): Promise<AdminSeasonView | null> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: {
      id: true,
      title: true,
      phase: true,
      startsAt: true,
      endsAt: true,
      featureFlags: true,
      scoringConfig: true,
      stages: {
        orderBy: { stageKey: "asc" },
        select: { stageKey: true, isGate: true, opensAt: true, closesAt: true },
      },
      tracks: { orderBy: { createdAt: "asc" }, select: { id: true, name: true } },
      schedules: { select: { phase: true, startsAt: true, appliedAt: true, note: true } },
    },
  });
  if (!season) return null;
  return {
    ...season,
    featureFlags: (season.featureFlags ?? {}) as Record<string, unknown>,
  };
}
