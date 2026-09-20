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
  leads: { total: number; unsubscribed: number };
  /** 미처리 어뷰징 플래그 */
  openAbuseFlags: number;
  /** 배포 확인이 끝난 참가작 수 — 시안 KPI 3 */
  deployedEntries: number;
  /** 참가작 전체의 유효 방문 합 — 시안 KPI 4 */
  totalVisitors: number;
  /** 답변이 안 나간 소명 */
  openAppeals: number;
  /** 손으로 볼 지표 플래그(수동 검토 미통과) */
  openMetricFlags: number;
  /**
    다음 게이트. 시안의 「다음 게이트 배치」 카드가 쓴다 — 마감이 지나지 않은
    게이트 중 가장 이른 것이다. 없으면 null(시즌 전이거나 둘 다 끝났다).
  */
  nextGate: {
    stageKey: string;
    name: string;
    closesAt: Date | null;
    /** 그 게이트가 판정할 대상 팀 수 */
    targets: number;
  } | null;
  /** 최근 감사 로그 5줄 — 시안 `.minlog` */
  recentAudit: {
    id: string;
    at: Date;
    action: string;
    reason: string;
  }[];
};

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

export async function loadAdminSummary(): Promise<AdminSummary> {
  const season = await prisma.season.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, slug: true, phase: true },
  });
  if (!season) {
    return {
      season: null,
      entries: { total: 0, active: 0, eliminated: 0, disqualified: 0 },
      pendingJudgments: 0,
      leads: { total: 0, unsubscribed: 0 },
      openAbuseFlags: 0,
      deployedEntries: 0,
      totalVisitors: 0,
      openAppeals: 0,
      openMetricFlags: 0,
      nextGate: null,
      recentAudit: [],
    };
  }

  const [
    byStatus,
    pendingJudgments,
    leads,
    unsubscribed,
    openAbuseFlags,
    deployedEntries,
    visitorAgg,
    openAppeals,
    openMetricFlags,
    gates,
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
      /* 참가작 전체 유효 방문 합 — 시안 KPI 4 「참가작 총 이용자」 */
      prisma.metricDaily.aggregate({
        where: { entry: { seasonId: season.id } },
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
        select: { stageKey: true, name: true, closesAt: true },
        orderBy: { closesAt: "asc" },
      }),
      /* 시안 `.minlog` — 다섯 줄 */
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, createdAt: true, action: true, reason: true },
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
    leads: { total: leads, unsubscribed },
    deployedEntries,
    totalVisitors: visitorAgg._sum.validVisitors ?? 0,
    openAppeals,
    openMetricFlags,
    /*
      마감이 안 지난 게이트 중 가장 이른 것. 마감이 비어 있는 게이트는 일정이
      아직 안 잡힌 것이라 뒤로 미룬다 — 날짜 없는 게이트를 「다음」으로 내세우면
      운영이 SLA를 못 잡는다.
    */
    nextGate: (() => {
      const now = devNow();
      const upcoming = gates.filter((g) => g.closesAt && g.closesAt >= now);
      const pick = upcoming[0] ?? gates.find((g) => !g.closesAt) ?? null;
      if (!pick) return null;
      return {
        stageKey: pick.stageKey,
        name: pick.name,
        closesAt: pick.closesAt,
        /* 판정 대상은 그 시즌에 살아 있는 팀이다 */
        targets: count(EntryStatus.active),
      };
    })(),
    recentAudit: recentAudit.map((row) => ({
      id: String(row.id),
      at: row.createdAt,
      action: row.action,
      reason: row.reason,
    })),
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

/** 판정 결과 라벨 — 운영 화면에서도 참가자 화면과 같은 말을 쓴다 */
export const JUDGMENT_LABEL: Record<string, string> = {
  [JudgmentResult.pass]: "통과",
  [JudgmentResult.revision]: "보완",
  [JudgmentResult.fail]: "미통과",
};
