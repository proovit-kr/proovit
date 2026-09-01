import { cache } from "react";

import { AwardType, DeployStatus, EntryStatus } from "@/generated/prisma/enums";
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

/**
 * 공개용 시즌 한 건. draft는 운영자만 보는 상태라 공개 조회에서 뺀다.
 *
 * `cache()`로 감싼 이유는 **한 요청에서 두 번 불리기 때문이다** —
 * `generateMetadata()`가 제목에 시즌명을 넣으려고 한 번, 페이지 본문이 한 번.
 * 감싸지 않으면 관전 트래픽마다 같은 조회가 두 배로 나간다. React의 요청
 * 단위 메모라 요청이 끝나면 비고, 요청끼리 섞이지 않는다.
 */
export const loadPublicSeason = cache(async function loadPublicSeason(
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
});

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
  /**
   * 확정된 종합 시상. 없으면 null이다.
   *
   * ⚠️ **순위에서 유추하지 않는다.** 순위를 이 화면에서 계산하지 않는 것과
   * 같은 이유다 — 1·2·3위에 상을 붙이는 것은 운영이 `awards`에 남기는 결정이고,
   * 화면이 대신 정하면 그게 곧 「우리가 준 상」이 된다. 부문상은 rank가 null이라
   * 종합(overall)만 읽는다.
   */
  award: { rank: number | null; label: string } | null;
  /** 참가작 주소. 관전자가 순위표에서 바로 서비스로 건너뛴다 */
  serviceUrl: string | null;
  /**
   * 직전 집계 대비 유효 방문 증감.
   * 앞 스냅샷이 없으면 null이다 — 첫 집계에 "+1,102"를 찍으면 하루 만에
   * 그만큼 늘어난 것으로 읽힌다.
   */
  deltaVisitors: number | null;
};

export type Leaderboard = {
  /** 이 순위가 언제 것인가. 스냅샷이 없으면 null */
  snapshotDate: Date | null;
  /** 최종 확정 순위인가. 확정되면 더 안 바뀐다는 사실 자체가 정보다 */
  isFinal: boolean;
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
/*
  시상 라벨. 운영이 `prizeDesc`를 적었으면 그 문구가 정본이고, 안 적었으면
  등수만 말한다. 시안은 1위에 트로피를 붙인다(「🏆 대상」).
*/
function awardOf(
  award: { rank: number | null; prizeDesc: string | null } | undefined,
): LeaderboardRow["award"] {
  if (!award) return null;
  const label =
    award.prizeDesc ??
    (award.rank === null
      ? "수상"
      : award.rank === 1
        ? "🏆 대상"
        : `${award.rank}위`);
  return { rank: award.rank, label };
}

export async function loadLeaderboard(seasonId: string): Promise<Leaderboard> {
  const entries = await prisma.entry.findMany({
    where: { seasonId, status: EntryStatus.active },
    orderBy: { appliedAt: "asc" },
    select: {
      id: true,
      ideaTitle: true,
      team: { select: { name: true } },
      serviceUrl: true,
      hostname: { select: { deployStatus: true, ownershipVerifiedAt: true } },
    },
  });
  if (entries.length === 0) {
    return { snapshotDate: null, isFinal: false, rows: [] };
  }

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
          isFinal: true,
        },
      })
    : [];

  /*
    전일 대비를 내려면 **직전 집계일**이 필요하다. 어제 날짜로 찾지 않는 이유는
    롤업이 하루 걸러 돌 수도 있어서다 — 그때 어제로 찾으면 증감이 통째로 빈다.
  */
  const previous = latest
    ? await prisma.leaderboardSnapshot.findFirst({
        where: { seasonId, snapshotDate: { lt: latest.snapshotDate } },
        orderBy: { snapshotDate: "desc" },
        select: { snapshotDate: true },
      })
    : null;

  const previousRows = previous
    ? await prisma.leaderboardSnapshot.findMany({
        where: { seasonId, snapshotDate: previous.snapshotDate },
        select: { entryId: true, validVisitorsTotal: true },
      })
    : [];

  /*
    시상. 시즌 종료 화면의 「수상」 칸이 이걸 그린다.
    awardedAt이 없으면 아직 발표 전이므로 화면에 내지 않는다.
  */
  const awards = await prisma.award.findMany({
    where: { seasonId, awardType: AwardType.overall, awardedAt: { not: null } },
    select: { entryId: true, rank: true, prizeDesc: true },
  });
  const awardByEntry = new Map(awards.map((a) => [a.entryId, a]));

  const byEntry = new Map(snapshots.map((s) => [s.entryId, s]));
  const beforeByEntry = new Map(
    previousRows.map((s) => [s.entryId, s.validVisitorsTotal]),
  );

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
      award: awardOf(awardByEntry.get(entry.id)),
      serviceUrl: entry.serviceUrl,
      deltaVisitors:
        snapshot && beforeByEntry.has(entry.id)
          ? snapshot.validVisitorsTotal - (beforeByEntry.get(entry.id) ?? 0)
          : null,
    };
  });

  /* 순위가 있는 팀이 위로, 없는 팀은 신청 순서 그대로 뒤에 붙는다 */
  rows.sort((a, b) => {
    if (a.rank === null && b.rank === null) return 0;
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    return a.rank - b.rank;
  });

  return {
    snapshotDate: latest?.snapshotDate ?? null,
    /* 한 장이라도 최종이면 그 집계가 최종이다 — 롤업이 통째로 찍는 값이다 */
    isFinal: snapshots.some((s) => s.isFinal),
    rows,
  };
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
  /**
   * 최근 순위. 정본은 `leaderboard_snapshots`고 여기서 계산하지 않는다 —
   * 화면마다 다르게 매기면 그게 곧 분쟁이다(리더보드 화면 주석과 같은 규칙).
   * 스냅샷이 없거나 이 팀이 그 안에 없으면 null이다.
   */
  rank: { position: number; of: number } | null;
  /**
   * 최근 7일 유효 방문. 합계가 아니라 **모양**을 보여주려는 값이라 배열이다.
   * 값이 없는 날은 0으로 채운다 — 빠진 날을 이어 그리면 없던 추세가 생긴다.
   */
  recentVisitors: number[];
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
        orderBy: { metricDate: "asc" },
        select: { metricDate: true, validVisitors: true, signups: true },
      })
    : [];

  /*
    최근 순위. 가장 최근 스냅샷 한 장을 보고 그 안에서 이 팀의 자리를 읽는다.
    분모(`of`)는 같은 스냅샷의 행 수다 — "12팀 중 2위"의 12를 다른 데서 세면
    실격 처리된 팀이 끼거나 빠져 숫자가 안 맞는다.
  */
  const latest = metricsPublic
    ? await prisma.leaderboardSnapshot.findFirst({
        where: { seasonId },
        orderBy: { snapshotDate: "desc" },
        select: { snapshotDate: true },
      })
    : null;

  const snapshotRows = latest
    ? await prisma.leaderboardSnapshot.findMany({
        where: {
          seasonId,
          snapshotDate: latest.snapshotDate,
          /*
            ⚠️ 생존 팀만 센다. 리더보드가 실격·자진포기 팀을 빼고 그리므로
            분모를 전체로 잡으면 "12팀 중 2위"의 12가 리더보드와 안 맞는다.
          */
          entry: { status: EntryStatus.active },
        },
        select: { entryId: true, rank: true },
      })
    : [];

  const mine = snapshotRows.find((row) => row.entryId === entryId);
  const rank = mine ? { position: mine.rank, of: snapshotRows.length } : null;

  /*
    최근 7일. 마지막 날부터 거꾸로 7칸을 만들고 있는 날만 채운다.
    행이 없는 날을 건너뛰면 선이 이어지면서 그 구간에 없던 추세가 생긴다.
  */
  const byDay = new Map(
    daily.map((row) => [row.metricDate.toISOString().slice(0, 10), row]),
  );
  const recentVisitors: number[] = [];
  for (let back = 6; back >= 0; back -= 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - 1 - back);
    const key = day.toISOString().slice(0, 10);
    recentVisitors.push(byDay.get(key)?.validVisitors ?? 0);
  }

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
    rank,
    /* 집계가 하나도 없으면 평평한 선 대신 아무것도 안 그린다 */
    recentVisitors: recentVisitors.some((v) => v > 0) ? recentVisitors : [],
  };
}

/**
 * 사이트맵이 쓸 참가작 목록.
 *
 * 화면용 로더(`loadPublicEntry`)를 N번 부르지 않는다 — 사이트맵 한 장에
 * 지표·스냅샷 조회가 팀 수만큼 딸려 붙는다. 여기서는 주소를 만드는 데 필요한
 * 두 칸만 읽는다.
 *
 * ⚠️ `status: active`만 넣는다. 실격·자진포기 팀의 참가작 페이지는 리더보드에서
 * 빠지는 것과 같은 이유로 사이트맵에도 없어야 한다 — 우리가 검색엔진에
 * 「이 주소를 색인해 달라」고 먼저 내미는 자리다.
 */
export async function listPublicEntries(
  seasonId: string,
): Promise<{ id: string; updatedAt: Date }[]> {
  return prisma.entry.findMany({
    where: { seasonId, status: EntryStatus.active },
    orderBy: { appliedAt: "asc" },
    select: { id: true, updatedAt: true },
  });
}
