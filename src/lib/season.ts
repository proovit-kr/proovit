import { SeasonPhase, type Season } from "@/generated/prisma/client";

import { prisma } from "./prisma";

/*
  phase는 순서가 있지만 enum은 대소 비교를 보장하지 않는다.
  03 ERD가 EntryStage에 대해 경고한 것과 같은 문제라, 같은 방식으로 상수 맵을 둔다.
  DB 필터가 필요해지면 그때 rank 컬럼을 추가한다.
*/
const PHASE_RANK: Record<SeasonPhase, number> = {
  draft: 0,
  pre_apply: 1,
  recruiting: 2,
  w1_demand: 3,
  gate1_review: 4,
  w2_build: 5,
  race: 6,
  gate2_review: 7,
  awarded: 8,
  archived: 9,
};

export function phaseAtLeast(phase: SeasonPhase, min: SeasonPhase): boolean {
  return PHASE_RANK[phase] >= PHASE_RANK[min];
}

/*
  랜딩 CTA 상태.

  「필요 페이지 정리」가 요구하는 "모집 전 → 사전신청 / 모집 중 → apply /
  진행 중 → 리더보드" 세 갈래가 이제 phase 하나로 갈린다.

  8/12까지는 갈라줄 값이 없어 phase(RECRUITING) + recruitStartAt 비교로 우회했다.
  종결본(2026-08-13)이 pre_apply를 넣으면서 그 우회가 사라졌고, 모집 기간 컬럼도
  season_schedules로 옮겨가 없어졌다(ADR-010). 시각을 여기서 비교하지 않는다 —
  전환은 크론이 season_schedules를 읽어 phase를 바꾸는 것으로 일어난다.
*/
export type LandingCta =
  | { kind: "PREREGISTER" } // 사전신청 — 이메일 수집
  | { kind: "APPLY" } // 모집 중 — /apply
  | { kind: "LEADERBOARD" } // 시즌 진행 중 — 관전
  | { kind: "CLOSED" }; // 종료 — 아카이브

export function resolveLandingCta(season: Season): LandingCta {
  if (season.phase === SeasonPhase.archived) return { kind: "CLOSED" };
  if (phaseAtLeast(season.phase, SeasonPhase.w1_demand)) {
    return { kind: "LEADERBOARD" };
  }
  if (season.phase === SeasonPhase.recruiting) return { kind: "APPLY" };

  // draft(비공개) · pre_apply — 둘 다 사전신청을 받는다.
  // draft는 getCurrentSeason이 애초에 걸러내므로 실질적으로 pre_apply만 온다.
  return { kind: "PREREGISTER" };
}

/*
  지금 노출할 시즌 1건.
  draft는 운영자만 보는 상태이므로 공개 조회에서 제외한다.
  여러 개가 열려 있으면 가장 최근에 만든 것을 쓴다.
*/
export async function getCurrentSeason(): Promise<Season | null> {
  return prisma.season.findFirst({
    where: { phase: { not: SeasonPhase.draft } },
    orderBy: { createdAt: "desc" },
  });
}
