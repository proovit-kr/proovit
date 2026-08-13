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
  ─────────────────────────────────────────────────────────────
  의미 술어 — phase 값에 직접 기대지 않기 위한 한 겹.

  ⚠️ **PLN3 화면정의서(8/13)의 분기표는 phase 6값 모델로 쓰여 있다** —
  `draft · pre_apply · recruiting · racing · awarded · archived`. 그런데 우리가
  8/13에 이식한 종결본 스키마는 10값이고, 그 자리의 이름이 `racing`이 아니라
  `race`다. 레이스 구간이 `w1_demand ~ gate2_review` 다섯 값으로 쪼개져 있다.

  둘 중 무엇이 맞는지는 **ADR-008(심사 구조 재정렬)** 이 8/17에 정한다
  (API 명세서 v0.2 §17 미확정 1번).

  그래서 접근 판정은 phase 값을 직접 비교하지 않고 아래 술어만 부른다.
  6값으로 합쳐지면 **이 파일의 술어 본문 네 줄만 고치면 되고**, canAccess와
  화면 30개는 손대지 않는다. 값 비교를 화면마다 흩뿌리면 그날 전부 다시 짠다.
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
 * 시즌 본편이 돌아가는 구간(PLN3의 `racing`).
 * 10값 모델에서는 심사 페이즈(`gate1_review`·`gate2_review`)도 여기 든다 —
 * 제출만 잠기고 대시보드·리더보드는 그대로 살아 있어야 하기 때문이다.
 */
export function isRacing(phase: SeasonPhase): boolean {
  return (
    phaseAtLeast(phase, SeasonPhase.w1_demand) &&
    PHASE_RANK[phase] <= PHASE_RANK[SeasonPhase.gate2_review]
  );
}

/** 게이트 심사 중 — 제출이 잠긴다. 6값 모델에는 이 구간이 없어 항상 false가 된다 */
export function isGateReview(phase: SeasonPhase): boolean {
  return (
    phase === SeasonPhase.gate1_review || phase === SeasonPhase.gate2_review
  );
}

/** 시상 발표 이후. 정산 액션이 열린다 */
export function isAwarded(phase: SeasonPhase): boolean {
  return phase === SeasonPhase.awarded;
}

/** 아카이브 — 모든 쓰기가 막힌다(요구사항 명세서 G4) */
export function isArchived(phase: SeasonPhase): boolean {
  return phase === SeasonPhase.archived;
}
