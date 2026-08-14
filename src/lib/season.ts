import { SeasonPhase, type Season } from "@/generated/prisma/client";
import { phaseAtLeast } from "@/lib/season-phase";

import { prisma } from "./prisma";

/* 페이즈 술어는 순수 모듈에 있다. 기존 import 경로를 깨지 않으려고 여기서 다시 내보낸다 */
export * from "@/lib/season-phase";

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
  if (phaseAtLeast(season.phase, SeasonPhase.racing)) {
    return { kind: "LEADERBOARD" };
  }
  if (season.phase === SeasonPhase.recruiting) return { kind: "APPLY" };

  // draft(비공개) · pre_apply — 둘 다 사전신청을 받는다.
  // draft는 getCurrentSeason이 애초에 걸러내므로 실질적으로 pre_apply만 온다.
  return { kind: "PREREGISTER" };
}

/**
 * 헤더(NavBar)의 주 버튼.
 *
 * 랜딩의 CTA와 **같은 판정**(resolveLandingCta)을 쓴다. 공개 화면마다 다른 문구가
 * 걸리면 "지금 신청이 되는 건가"를 화면마다 다르게 답하는 셈이 된다.
 * 랜딩만은 예외로 자기 폼으로 스크롤하는 onClick을 따로 넘긴다.
 */
export function resolveNavCta(season: Season): { href: string; label: string } {
  const kind = resolveLandingCta(season).kind;
  if (kind === "APPLY") return { href: "/apply", label: "참가 신청" };
  if (kind === "LEADERBOARD") {
    return { href: `/seasons/${season.slug}/leaderboard`, label: "리더보드" };
  }
  if (kind === "CLOSED") {
    return { href: `/seasons/${season.slug}`, label: "시즌 보기" };
  }
  return { href: "/?preregister=1", label: "사전 신청" };
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
