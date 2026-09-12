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
 * 랜딩만은 예외로, 이동 대신 자기 폼으로 스크롤하는 onClick을 따로 넘긴다.
 */
/*
  헤더 CTA. **시즌 상태와 무관하게 「사전 신청하기」 하나다.**

  시안의 공개 헤더는 셋 다(랜딩 1439행·리더보드 1607행·참가작 1655행) 같은
  버튼을 그린다. 헤더에는 상태가 없다.

  ⚠️ 한때 상태별로 갈랐다(모집 중「참가 신청하기」, 레이스 중「리더보드 보기」).
  시안이 시즌 상세 화면 1712행에 적어 둔 것을 헤더 문구로 잘못 읽은 것이다 —
  그건 그 화면 안의 버튼 설명이었다. 2026-09-06에 되돌렸다.

  상태별 헤더 시안이 따로 올 예정이다(윤서). 그때까지는 시안대로 하나만 둔다.
*/
export function resolveNavCta(): { href: string; label: string } {
  return { href: "/?preregister=1", label: "사전 신청하기" };
}

/**
 * 공개 헤더에 넘길 것 한 묶음. `<NavBar {...resolveNav(season)} />`.
 *
 * 한 줄로 묶어 두는 이유는 **빠뜨리지 않기 위해서**다. 화면마다 같은 다섯 줄을
 * 손으로 적으면 새 화면이 생길 때마다 하나씩 어긋난다(실제로 이 리포에서
 * 반복된 종류의 새어나감이다).
 */
export function resolveNav(season: Season | null): {
  leaderboardHref?: string;
  showMenu: boolean;
  cta: { href: string; label: string };
} {
  if (!season) return { showMenu: false, cta: { href: "/", label: "홈" } };
  return {
    leaderboardHref: `/seasons/${season.slug}/leaderboard`,
    showMenu: navMenuVisible(season),
    cta: resolveNavCta(),
  };
}

/**
 * 헤더 메뉴(리그 소개·리더보드·시즌 아카이브)를 내보이는가.
 *
 * ⚠️ **시안과 다르게 한 것**(2026-08-31 수연 지시). 시안은 공개 헤더에 늘
 * 메뉴 셋을 두지만, 리그가 시작되기 전에는 워드마크만 남긴다 — 사전신청만
 * 받는 동안 갈 곳이 랜딩 하나뿐이라 메뉴가 가리키는 데가 없다.
 *
 * 기준을 `recruiting`으로 잡는다. 「리그 시작」은 모집이 열리는 때이고,
 * 그때 `/apply`가 열려 실제로 갈 곳이 생긴다. 리더보드는 레이스부터라
 * 모집 구간에는 잠긴 화면을 가리키지만, 그건 시안이 이미 그리는 상태다
 * (`.lb-empty`·잠김 안내).
 */
export function navMenuVisible(season: Season): boolean {
  return phaseAtLeast(season.phase, SeasonPhase.recruiting);
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
