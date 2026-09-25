import { cache } from "react";

import { SeasonPhase, type Season } from "@/generated/prisma/client";
import { parseFeatureFlags } from "@/lib/feature-flags";
import { toHeaderSeason, type PublicHeaderInput } from "@/lib/header-state";
import { withLeaderboardOpen } from "@/lib/race-read";
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
 * 공개 헤더에 넘길 **시즌 축**. `<NavBar season={await publicHeaderSeason(season)} />`.
 *
 * 한 줄로 묶어 두는 이유는 **빠뜨리지 않기 위해서**다. 화면마다 같은 다섯 줄을
 * 손으로 적으면 새 화면이 생길 때마다 하나씩 어긋난다(실제로 이 리포에서
 * 반복된 종류의 새어나감이다).
 *
 * 유저 축(로그인·참가 상태)은 여기 없다. 세션을 읽은 화면은
 * `loadHeaderViewer()`(header-read.ts)로 넘기고, 랜딩처럼 못 읽는 화면은
 * NavBar가 클라이언트에서 채운다.
 *
 * 헤더 CTA를 상태별로 가르는 것은 2026-09-06에 한 번 되돌렸다가(시즌 상세
 * 화면의 버튼 설명을 헤더 문구로 잘못 읽었다) 「헤더 상태별 시안 v1.0」이
 * 오면서 다시 갈랐다 — 이번에는 판정표가 시안에 있다(header-state.ts).
 *
 * `flags.leaderboard`는 날것의 플래그가 아니라 **「지금 리더보드를 여는가」**다
 * (race-read.ts `withLeaderboardOpen` — 플래그 켜짐 그리고 레이스를 시작한 팀이
 * 있음, 2026-09-26). 그래서 async다 — 가장 이른 레이스 시작을 읽는다.
 */
export async function publicHeaderSeason(
  season: Season | null,
): Promise<PublicHeaderInput["season"]> {
  if (!season) return null;
  const flags = await withLeaderboardOpen(season, parseFeatureFlags(season.featureFlags));
  return {
    kind: toHeaderSeason(season.phase),
    slug: season.slug,
    title: season.title,
    flags: {
      notifications: flags.notifications,
      leaderboard: flags.leaderboard,
    },
  };
}

/*
  지금 노출할 시즌 1건.
  draft는 운영자만 보는 상태이므로 공개 조회에서 제외한다.
  여러 개가 열려 있으면 가장 최근에 만든 것을 쓴다.
*/
/*
  `cache`로 요청 안에서 한 번만 조회한다 — 페이지·헤더·푸터가 각자 부른다.
  렌더 밖(라우트 핸들러)에서는 캐시 없이 그냥 조회한다.
*/
export const getCurrentSeason = cache(async (): Promise<Season | null> => {
  return prisma.season.findFirst({
    where: { phase: { not: SeasonPhase.draft } },
    orderBy: { createdAt: "desc" },
  });
});
