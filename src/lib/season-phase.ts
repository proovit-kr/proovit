/*
  시즌 페이즈의 **순수** 부분. DB를 건드리지 않는다.
  season.ts는 prisma를 import하므로, 판정만 필요한 곳(access-policy.ts·테스트)이
  거기서 가져오면 DB 클라이언트가 따라온다 — access-policy.ts 머리 주석과 같은 이유다.
*/

import { SeasonPhase } from "@/generated/prisma/client";

const PHASE_RANK: Record<SeasonPhase, number> = {
  draft: 0,
  pre_apply: 1,
  recruiting: 2,
  racing: 3,
  awarded: 4,
  archived: 5,
};

export function phaseAtLeast(phase: SeasonPhase, min: SeasonPhase): boolean {
  return PHASE_RANK[phase] >= PHASE_RANK[min];
}

/*
  ─────────────────────────────────────────────────────────────
  의미 술어 — phase 값에 직접 기대지 않기 위한 한 겹.

  ✅ **2026-08-14: 6값으로 확정됐다.** 동혁이 종결본 스키마를 고쳐
  `draft · pre_apply · recruiting · racing · awarded · archived`가 됐고
  (8/13 스크럼 회신), 이제 PLN3 화면정의서 분기표와 같은 모델이다.

  전날 10값(`w1_demand ~ gate2_review`)으로 이식해 두었는데, 판정이 값을
  직접 비교하지 않고 이 술어만 부르게 해 둔 덕에 **고친 곳은 이 파일과
  season.ts 한 줄이고 canAccess·화면 34개는 손대지 않았다.**

  ⚠️ 사라진 것 하나: `isGateReview()`. 게이트 심사 구간이 phase에 없으므로
  「심사 중 제출 잠금」은 **팀별 상태로 판정한다** — `entry.stage`가 게이트
  스테이지(s2·s5)에 멈춘 팀이 판정 대기다. access-policy.ts의
  `isAwaitingGate()`가 그 자리를 받는다. phase로 되돌리지 말 것.
  ─────────────────────────────────────────────────────────────
*/

/** 아직 공개 전. 운영자만 본다 */
export function isDraft(phase: SeasonPhase): boolean {
  return phase === SeasonPhase.draft;
}

/** 사전신청만 받는 구간 — 참가 신청은 아직 닫혀 있다 */
export function isPreApply(phase: SeasonPhase): boolean {
  return phase === SeasonPhase.pre_apply;
}

/** 참가 신청을 받는 구간. `/apply`가 열린다 */
export function isRecruiting(phase: SeasonPhase): boolean {
  return phase === SeasonPhase.recruiting;
}

/**
 * 시즌 본편이 돌아가는 구간. 게이트 심사 기간도 여기 든다 —
 * 제출만 잠기고 대시보드·리더보드는 그대로 살아 있어야 한다.
 * 스테이지별 제출 창은 `stages.opens_at`·`closes_at`이 따로 판정한다.
 */
export function isRacing(phase: SeasonPhase): boolean {
  return phase === SeasonPhase.racing;
}

/** 시상 발표 이후. 정산 액션이 열린다 */
export function isAwarded(phase: SeasonPhase): boolean {
  return phase === SeasonPhase.awarded;
}

/** 아카이브 — 모든 쓰기가 막힌다(요구사항 명세서 G4) */
export function isArchived(phase: SeasonPhase): boolean {
  return phase === SeasonPhase.archived;
}

/**
 * 레이스가 시작된 뒤로는 계속 참인가 — 레이스·시상·아카이브.
 *
 * `isRacing`과 갈라 쓰는 자리가 **공개 조회 화면**이다. 리더보드와 참가작
 * 페이지를 `isRacing`으로 막아 두면 시상 발표와 동시에 닫힌다. 관전 트래픽이
 * 가장 몰리는 때가 바로 그때고, 시즌이 끝난 뒤에 남는 것이 순위와 참가작이라
 * 이 리그가 다음 시즌 모집에 쓸 유일한 증거이기도 하다.
 *
 * 쓰기는 이 술어를 쓰지 않는다 — 아카이브 잠금(G4)은 canAccess가 따로 본다.
 */
export function isRacingOrLater(phase: SeasonPhase): boolean {
  return phaseAtLeast(phase, SeasonPhase.racing);
}
