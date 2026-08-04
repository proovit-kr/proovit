import { SeasonPhase, type Season } from "@/generated/prisma/client";

import { prisma } from "./prisma";

/*
  phase는 순서가 있지만 enum은 대소 비교를 보장하지 않는다.
  03 ERD가 EntryStage에 대해 경고한 것과 같은 문제라, 같은 방식으로 상수 맵을 둔다.
  DB 필터가 필요해지면 그때 rank 컬럼을 추가한다.
*/
const PHASE_RANK: Record<SeasonPhase, number> = {
  DRAFT: 0,
  RECRUITING: 1,
  W1_DEMAND: 2,
  GATE1_REVIEW: 3,
  W2_BUILD: 4,
  RACE: 5,
  GATE2_REVIEW: 6,
  AWARDED: 7,
  ARCHIVED: 8,
};

export function phaseAtLeast(phase: SeasonPhase, min: SeasonPhase): boolean {
  return PHASE_RANK[phase] >= PHASE_RANK[min];
}

/*
  랜딩 CTA 상태.

  ⚠️ 「필요 페이지 정리」는 "모집 전 → 사전신청 / 모집 중 → apply / 진행 중 → 리더보드"로
     세 갈래를 요구하는데, 06 §4.2의 9개 phase에는 '사전신청만' 단계가 없다.
     그래서 phase(RECRUITING) + recruitStartAt 비교로 앞의 두 갈래를 나눈다.
     회의 확정 대상 — prisma/seed.ts 주석 참조.
*/
export type LandingCta =
  | { kind: "PREREGISTER" } // 모집 전 — 이메일 수집
  | { kind: "APPLY" } // 모집 중 — /apply
  | { kind: "LEADERBOARD" } // 시즌 진행 중 — 관전
  | { kind: "CLOSED" }; // 종료 — 아카이브

export function resolveLandingCta(season: Season, now = new Date()): LandingCta {
  if (season.phase === SeasonPhase.ARCHIVED) return { kind: "CLOSED" };
  if (phaseAtLeast(season.phase, SeasonPhase.W1_DEMAND)) {
    return { kind: "LEADERBOARD" };
  }

  if (season.phase === SeasonPhase.RECRUITING) {
    const started = season.recruitStartAt !== null && now >= season.recruitStartAt;
    const ended = season.recruitEndAt !== null && now > season.recruitEndAt;
    if (started && !ended) return { kind: "APPLY" };
    // 모집 시작 전이거나 이미 마감됐으면 다음 기수 사전신청을 받는다
    return { kind: "PREREGISTER" };
  }

  // DRAFT — 아직 공개되지 않은 시즌
  return { kind: "PREREGISTER" };
}

/*
  지금 노출할 시즌 1건.
  DRAFT는 운영자만 보는 상태이므로 공개 조회에서 제외한다.
  여러 개가 열려 있으면 가장 최근에 만든 것을 쓴다.
*/
export async function getCurrentSeason(): Promise<Season | null> {
  return prisma.season.findFirst({
    where: { phase: { not: SeasonPhase.DRAFT } },
    orderBy: { createdAt: "desc" },
  });
}
