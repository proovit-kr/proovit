import {
  AbuseStatus,
  AwardType,
  EntryStatus,
  SanctionStage,
  SanctionStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/*
  시상 콘솔의 조회.

  ⚠️ `admin-read.ts`에 넣지 않고 화면 옆에 둔다. 이 조회는 시상 화면 하나만
  쓰고, 다른 화면이 부르기 시작하면 「순위 확정 전/후」라는 이 화면만의 상태
  구분이 조회 계층으로 새어 나간다.

  ⚠️ **순위를 여기서 새로 계산하지 않는다.** 순위는 롤업이 만든
  `leaderboard_snapshots`가 정본이고(06 §6.3), 운영 콘솔은 그 값을 읽어
  확정만 한다. 화면에서 다시 계산하면 공개 리더보드와 운영 화면이 서로 다른
  순위를 말하게 된다 — 확정 직전에 그 둘이 갈리는 것이 가장 나쁘다.
*/

/** 종합 시상 배분 — 1위 대상, 2·3위 우수상. 시안 표의 「수상」 칸이 이것이다 */
export const AWARD_LABEL: Record<number, string> = {
  1: "🏆 대상",
  2: "우수상",
  3: "우수상",
};

export type AwardRow = {
  entryId: string;
  teamName: string;
  ideaTitle: string;
  /** 확정 전에는 스냅샷의 순위. 시상에서 빠진 팀은 null */
  rank: number | null;
  /** 최종 지표 — 유효 이용자 누적(잠정 순위의 기준, 롤업 머리 주석) */
  visitors: number;
  /** 확정된 어뷰징 플래그가 뺀 방문(음수). 없으면 null — 시안 「512 → 298」·「−214」 */
  adjusted: number | null;
  /** 제재로 순위에서 빠졌는가 — 시안 `.strike` 행 */
  struck: boolean;
  /** 제재 반영 칸. 없으면 null */
  sanction: { label: string; detail: string } | null;
  /** 축 하한 미달(06 §6.3). 순위표에는 남고 종합 시상에서만 빠진다 */
  ineligible: boolean;
  /** 확정 전에는 제안값, 확정 뒤에는 기록된 값 */
  award: string | null;
};

export type AwardBoard = {
  /** 집계일. 없으면 아직 롤업이 한 번도 안 돈 것이다 */
  snapshotDate: Date | null;
  /** 확정 여부. 시안의 「드래프트(확정 전)」/「FINAL」을 가르는 값 */
  isFinal: boolean;
  /** 확정 시각 — 확정된 뒤에만 */
  finalizedAt: Date | null;
  rows: AwardRow[];
};

const SANCTION_LABEL: Record<string, string> = {
  [SanctionStage.warning]: "경고",
  [SanctionStage.week_invalidated]: "지표 무효화",
  [SanctionStage.disqualified]: "실격",
  [SanctionStage.award_revoked]: "시상 취소",
};

export async function loadAwardBoard(seasonId: string): Promise<AwardBoard> {
  /* 가장 최근 집계일 하나만 본다 — 날짜가 섞이면 순위가 섞인다 */
  const latest = await prisma.leaderboardSnapshot.findFirst({
    where: { seasonId },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });
  if (!latest) {
    return { snapshotDate: null, isFinal: false, finalizedAt: null, rows: [] };
  }

  const snapshots = await prisma.leaderboardSnapshot.findMany({
    where: { seasonId, snapshotDate: latest.snapshotDate },
    orderBy: { rank: "asc" },
    select: {
      entryId: true,
      rank: true,
      score: true,
      isAwardEligible: true,
      isFinal: true,
      validVisitorsTotal: true,
      entry: {
        select: {
          status: true,
          ideaTitle: true,
          team: { select: { name: true } },
        },
      },
    },
  });

  /*
    제재. 적용된 것만 본다 — `pending`은 소명 기한이 남은 상태라(제16조1항)
    아직 순위를 깎지 않는다. 그걸 여기서 반영하면 소명이 인용됐을 때
    이미 확정된 순위를 되돌려야 한다.
  */
  const sanctions = await prisma.sanction.findMany({
    where: {
      status: SanctionStatus.applied,
      entry: { seasonId },
    },
    orderBy: { appliedAt: "desc" },
    select: { entryId: true, stage: true, detail: true },
  });
  const sanctionByEntry = new Map(sanctions.map((s) => [s.entryId, s]));

  /* 확정된 플래그가 뺀 방문 — 팀마다 합 */
  const flags = await prisma.abuseFlag.groupBy({
    by: ["entryId"],
    where: { status: AbuseStatus.upheld, adjustedVisitors: { not: null }, entry: { seasonId } },
    _sum: { adjustedVisitors: true },
  });
  const adjustedByEntry = new Map(flags.map((f) => [f.entryId, f._sum.adjustedVisitors ?? null]));

  /* 확정된 시상. 있으면 제안값 대신 이 값을 그린다 */
  const awards = await prisma.award.findMany({
    where: { seasonId, awardType: AwardType.overall },
    select: { entryId: true, rank: true, prizeDesc: true, awardedAt: true },
  });
  const awardByEntry = new Map(awards.map((a) => [a.entryId, a]));

  const isFinal = snapshots.some((s) => s.isFinal);
  const finalizedAt =
    awards.map((a) => a.awardedAt).find((at) => at !== null) ?? null;

  const rows: AwardRow[] = snapshots.map((snapshot) => {
    const sanction = sanctionByEntry.get(snapshot.entryId) ?? null;
    const recorded = awardByEntry.get(snapshot.entryId);

    /*
      순위에서 빼는 조건 둘. 실격된 팀과, 시상 취소 제재를 받은 팀이다.
      탈락(eliminated)은 여기서 빼지 않는다 — 게이트에서 떨어진 것이지
      제재가 아니라서(제9조 ④) 순위표에는 남는다.
    */
    const struck =
      snapshot.entry.status === EntryStatus.disqualified ||
      sanction?.stage === SanctionStage.disqualified ||
      sanction?.stage === SanctionStage.award_revoked;

    const ineligible = !snapshot.isAwardEligible;

    const proposed =
      struck || ineligible ? null : (AWARD_LABEL[snapshot.rank] ?? null);

    return {
      entryId: snapshot.entryId,
      teamName: snapshot.entry.team.name,
      ideaTitle: snapshot.entry.ideaTitle,
      rank: struck ? null : snapshot.rank,
      visitors: snapshot.validVisitorsTotal,
      adjusted: adjustedByEntry.get(snapshot.entryId) ?? null,
      struck,
      sanction: sanction
        ? {
            label: SANCTION_LABEL[sanction.stage] ?? sanction.stage,
            detail: sanction.detail,
          }
        : null,
      ineligible,
      award: recorded
        ? (recorded.prizeDesc ?? AWARD_LABEL[recorded.rank ?? 0] ?? "수상")
        : proposed,
    };
  });

  return {
    snapshotDate: latest.snapshotDate,
    isFinal,
    finalizedAt,
    rows,
  };
}
