import { DeployStatus, EntryStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/*
  공개 화면(시즌 상세·리더보드·참가작)의 조회.

  ⚠️ **공개 범위가 문서로 정해져 있다** — 동의 문안 A의 「공개 범위 안내」다:
  "리더보드·아카이브 등 공개 화면에는 **팀명, 참가작 명칭·URL, 지표만** 표시돼요.
  성명·연락처는 공개되지 않아요." 그래서 이 파일의 select에 `users`가 없다.
  닉네임조차 올리지 않는다 — 공개 단위는 사람이 아니라 팀이다.

  ⚠️ 순위·점수를 여기서 계산하지 않는다. 정본은 `leaderboard_snapshots`이고
  그 산식이 미확정이다. 스냅샷이 없으면 **순위가 없는 목록**을 준다 — 화면이
  임의 순서를 매기면 그게 곧 "우리가 정한 순위"가 된다.
*/

export type PublicSeason = {
  id: string;
  slug: string;
  title: string;
  theme: string | null;
  phase: string;
  startsAt: Date | null;
  endsAt: Date | null;
  stages: {
    stageKey: string;
    name: string;
    isGate: boolean;
    opensAt: Date | null;
    closesAt: Date | null;
  }[];
  tracks: { name: string; description: string | null }[];
};

/** 공개용 시즌 한 건. draft는 운영자만 보는 상태라 공개 조회에서 뺀다 */
export async function loadPublicSeason(
  slug: string,
): Promise<PublicSeason | null> {
  const season = await prisma.season.findFirst({
    where: { slug, phase: { not: "draft" } },
    select: {
      id: true,
      slug: true,
      title: true,
      theme: true,
      phase: true,
      startsAt: true,
      endsAt: true,
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
      tracks: {
        orderBy: { name: "asc" },
        select: { name: true, description: true },
      },
    },
  });
  return season;
}

export type LeaderboardRow = {
  entryId: string;
  teamName: string;
  ideaTitle: string;
  /** 스냅샷이 없으면 null — 「집계 전」이다 */
  rank: number | null;
  score: string | null;
  validVisitors: number;
  revenue: bigint;
  /** 측정 주소가 확인되지 않은 팀. 지표가 0인 이유를 밝힌다 */
  notDeployed: boolean;
  /** 축 하한 미달로 종합 시상에서 빠지는 팀. 순위표에는 남는다 */
  awardIneligible: boolean;
};

export type Leaderboard = {
  /** 이 순위가 언제 것인가. 스냅샷이 없으면 null */
  snapshotDate: Date | null;
  rows: LeaderboardRow[];
};

/**
 * 리더보드.
 *
 * **실격·자진포기 팀은 즉시 빠진다**(PLN3 2장). 스냅샷에는 그때의 행이 남아
 * 있지만 공개 화면에서는 지금 상태를 따른다 — 실격된 팀이 순위표에 남아 있으면
 * 그 자체가 분쟁이 된다.
 *
 * 스냅샷이 없으면 참가팀만 순위 없이 돌려준다. 「아직 집계 전」과 「참가팀이
 * 없다」는 다른 상태이고, 관전자에게는 둘을 구분해 보여줘야 한다.
 */
export async function loadLeaderboard(seasonId: string): Promise<Leaderboard> {
  const entries = await prisma.entry.findMany({
    where: { seasonId, status: EntryStatus.active },
    orderBy: { appliedAt: "asc" },
    select: {
      id: true,
      ideaTitle: true,
      team: { select: { name: true } },
      hostname: { select: { deployStatus: true, ownershipVerifiedAt: true } },
    },
  });
  if (entries.length === 0) return { snapshotDate: null, rows: [] };

  /* 가장 최근 집계일 하나를 잡고 그날 것만 읽는다 — 날짜가 섞이면 순위가 섞인다 */
  const latest = await prisma.leaderboardSnapshot.findFirst({
    where: { seasonId },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });

  const snapshots = latest
    ? await prisma.leaderboardSnapshot.findMany({
        where: { seasonId, snapshotDate: latest.snapshotDate },
        select: {
          entryId: true,
          rank: true,
          score: true,
          validVisitorsTotal: true,
          revenueTotal: true,
          isAwardEligible: true,
        },
      })
    : [];

  const byEntry = new Map(snapshots.map((s) => [s.entryId, s]));

  const rows: LeaderboardRow[] = entries.map((entry) => {
    const snapshot = byEntry.get(entry.id);
    return {
      entryId: entry.id,
      teamName: entry.team.name,
      ideaTitle: entry.ideaTitle,
      rank: snapshot?.rank ?? null,
      score: snapshot ? snapshot.score.toString() : null,
      validVisitors: snapshot?.validVisitorsTotal ?? 0,
      revenue: snapshot?.revenueTotal ?? BigInt(0),
      notDeployed:
        entry.hostname?.deployStatus !== DeployStatus.active ||
        entry.hostname.ownershipVerifiedAt === null,
      awardIneligible: snapshot ? !snapshot.isAwardEligible : false,
    };
  });

  /* 순위가 있는 팀이 위로, 없는 팀은 신청 순서 그대로 뒤에 붙는다 */
  rows.sort((a, b) => {
    if (a.rank === null && b.rank === null) return 0;
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    return a.rank - b.rank;
  });

  return { snapshotDate: latest?.snapshotDate ?? null, rows };
}

export type PublicEntry = {
  id: string;
  teamName: string;
  ideaTitle: string;
  ideaSummary: string | null;
  serviceUrl: string | null;
  stage: string;
  status: string;
  notDeployed: boolean;
  /** 지표 공개에 동의한 팀만 숫자를 노출한다 */
  metricsPublic: boolean;
  metrics: { validVisitors: number; signups: number; asOf: Date } | null;
};

/**
 * 참가작 공개 페이지.
 *
 * ⚠️ **지표는 전일까지만 보여준다.** 실시간으로 열면 경쟁팀이 남의 유입을
 * 분 단위로 추적할 수 있고, 그게 곧 어뷰징 유인이 된다(PLN8 조사·정의서와 같은 이유).
 * 그래서 오늘 날짜 행은 합계에서 뺀다.
 */
export async function loadPublicEntry(
  entryId: string,
  seasonId: string,
): Promise<PublicEntry | null> {
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, seasonId },
    select: {
      id: true,
      ideaTitle: true,
      ideaSummary: true,
      serviceUrl: true,
      stage: true,
      status: true,
      team: { select: { name: true } },
      hostname: { select: { deployStatus: true, ownershipVerifiedAt: true } },
      consents: {
        where: { type: "metrics_public" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { granted: true },
      },
    },
  });
  if (!entry) return null;

  /* append-only 로그라 가장 최근 행이 최종 상태다(스키마 consents 주석) */
  const metricsPublic = entry.consents[0]?.granted ?? false;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const daily = metricsPublic
    ? await prisma.metricDaily.findMany({
        where: { entryId, metricDate: { lt: today } },
        select: { metricDate: true, validVisitors: true, signups: true },
      })
    : [];

  const asOf = daily.reduce<Date | null>(
    (latest, row) =>
      latest === null || row.metricDate > latest ? row.metricDate : latest,
    null,
  );

  return {
    id: entry.id,
    teamName: entry.team.name,
    ideaTitle: entry.ideaTitle,
    ideaSummary: entry.ideaSummary,
    serviceUrl: entry.serviceUrl,
    stage: entry.stage,
    status: entry.status,
    notDeployed:
      entry.hostname?.deployStatus !== DeployStatus.active ||
      entry.hostname.ownershipVerifiedAt === null,
    metricsPublic,
    metrics:
      asOf === null
        ? null
        : {
            validVisitors: daily.reduce((sum, r) => sum + r.validVisitors, 0),
            signups: daily.reduce((sum, r) => sum + r.signups, 0),
            asOf,
          },
  };
}
