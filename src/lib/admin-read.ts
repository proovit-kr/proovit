import {
  DeployStatus,
  EntryStatus,
  JudgmentResult,
  LeadStatus,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { devNow } from "@/lib/dev-clock";

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
      /* 롤업은 하루 한 행을 15분마다 덮어쓴다 — 가장 나중에 고쳐진 행이 마지막 롤업이다 */
      prisma.leaderboardSnapshot.findFirst({
        where: { seasonId: season.id },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      /* 시안 `.minlog` — 다섯 줄 */
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: AUDIT_SELECT,
      }),
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
    lastRollupAt: lastRollup?.updatedAt ?? null,
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
  memberCount: number;
  ideaTitle: string;
  stage: string;
  status: EntryStatus;
  chargeType: string;
  serviceUrl: string | null;
  deployed: boolean;
  submissions: number;
  appliedAt: Date | null;
};

/**
 * 참가팀 목록.
 *
 * 운영이 이 화면에서 판단하는 것은 「누가 어디까지 왔고 지금 살아 있는가」다.
 * 그래서 진도·생존 상태·배포 여부·제출 수를 한 줄에 같이 둔다 — 화면을 옮겨
 * 다니며 맞춰보게 하면 실격 판단이 늦어진다.
 */
export async function loadAdminEntries(
  seasonId: string,
): Promise<AdminEntryRow[]> {
  const entries = await prisma.entry.findMany({
    where: { seasonId },
    orderBy: [{ status: "asc" }, { appliedAt: "asc" }],
    select: {
      id: true,
      ideaTitle: true,
      stage: true,
      status: true,
      chargeType: true,
      serviceUrl: true,
      appliedAt: true,
      team: { select: { name: true, _count: { select: { members: true } } } },
      hostname: { select: { deployStatus: true, ownershipVerifiedAt: true } },
      _count: { select: { submissions: true } },
    },
  });

  return entries.map((entry) => ({
    id: entry.id,
    teamName: entry.team.name,
    memberCount: entry.team._count.members,
    ideaTitle: entry.ideaTitle,
    stage: entry.stage,
    status: entry.status,
    chargeType: entry.chargeType,
    serviceUrl: entry.serviceUrl,
    deployed:
      entry.hostname?.deployStatus === DeployStatus.active &&
      entry.hostname.ownershipVerifiedAt !== null,
    submissions: entry._count.submissions,
    appliedAt: entry.appliedAt,
  }));
}

export type AdminLeadRow = {
  id: string;
  email: string;
  status: LeadStatus;
  sourceChannel: string | null;
  utmSource: string | null;
  marketingOptIn: boolean;
  unsubscribedAt: Date | null;
  createdAt: Date;
};

/**
 * 사전신청 리드.
 *
 * ⚠️ 이메일이 그대로 보이는 화면이다. 목록을 화면 밖으로 빼는 기능(내려받기)은
 * **일부러 만들지 않았다** — 파일로 나가는 순간 접근 통제가 끝나고, 마케팅 발송은
 * 발송 도구가 직접 DB를 읽는 편이 안전하다.
 *
 * 수신거부한 사람도 목록에서 지우지 않고 표시만 한다. 지우면 같은 주소로 다시
 * 발송할 수 있게 되어 수신거부의 뜻이 사라진다.
 */
export async function loadAdminLeads(
  seasonId: string,
  take: number = 200,
): Promise<{ rows: AdminLeadRow[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.lead.findMany({
      where: { seasonId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        email: true,
        status: true,
        sourceChannel: true,
        utmSource: true,
        marketingOptIn: true,
        unsubscribedAt: true,
        createdAt: true,
      },
    }),
    prisma.lead.count({ where: { seasonId } }),
  ]);
  return { rows, total };
}

export type AdminSeasonRow = {
  id: string;
  title: string;
  slug: string;
  phase: string;
  startsAt: Date | null;
  endsAt: Date | null;
  entryCount: number;
  stages: { stageKey: string; name: string; isGate: boolean; opensAt: Date | null; closesAt: Date | null }[];
  schedules: { phase: string; startsAt: Date; appliedAt: Date | null; note: string | null }[];
};

/**
 * 시즌 목록과 전환 일정.
 *
 * 페이즈 전환의 정본은 `season_schedules`이고 크론이 그 표를 읽는다(ADR-010).
 * 화면은 **예정과 실제를 나란히** 보여준다 — 크론이 안 돌았는지 운영자가 앞당겼는지가
 * 그 두 칸의 차이로 드러난다.
 */
export async function loadAdminSeasons(): Promise<AdminSeasonRow[]> {
  const seasons = await prisma.season.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      phase: true,
      startsAt: true,
      endsAt: true,
      _count: { select: { entries: true } },
      stages: {
        orderBy: { stageKey: "asc" },
        select: {
          stageKey: true,
          name: true,
          isGate: true,
          opensAt: true,
          closesAt: true,
        },
      },
      schedules: {
        orderBy: { startsAt: "asc" },
        select: {
          phase: true,
          startsAt: true,
          appliedAt: true,
          note: true,
        },
      },
    },
  });

  return seasons.map((season) => ({
    id: season.id,
    title: season.title,
    slug: season.slug,
    phase: season.phase,
    startsAt: season.startsAt,
    endsAt: season.endsAt,
    entryCount: season._count.entries,
    stages: season.stages,
    schedules: season.schedules,
  }));
}

export type AdminSeasonView = {
  id: string;
  title: string;
  phase: string;
  startsAt: Date | null;
  endsAt: Date | null;
  stages: { stageKey: string; isGate: boolean; opensAt: Date | null; closesAt: Date | null }[];
  tracks: { id: string; name: string }[];
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
    },
  });
  if (!season) return null;
  return {
    ...season,
    featureFlags: (season.featureFlags ?? {}) as Record<string, unknown>,
  };
}

/** 판정 결과 라벨 — 운영 화면에서도 참가자 화면과 같은 말을 쓴다 */
export const JUDGMENT_LABEL: Record<string, string> = {
  [JudgmentResult.pass]: "통과",
  [JudgmentResult.revision]: "보완",
  [JudgmentResult.fail]: "미통과",
};
