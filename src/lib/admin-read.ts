import {
  DeployStatus,
  EntryStatus,
  JudgmentResult,
  LeadStatus,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

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
    };
  }

  const [byStatus, pendingJudgments, leads, unsubscribed, openAbuseFlags] =
    await Promise.all([
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
