/*
  접근 판정·대시보드 분기 검증 — PLN3 화면정의서를 그대로 돌린다.
    3.1 「정상 흐름」 9행    → nextAction
    3.2 「예외 조합」        → canAccess
  여기에 기본 규약(401·403·404·409)과 제출 진도 조건을 더해 56케이스다.

  돌리는 법:  npm test
  DB를 건드리지 않는다 — 판정이 순수 함수라 환경변수도 필요 없다.

  판정표(access-policy.ts)나 분기표(dashboard-state.ts)를 고치면 여기부터 돌린다.
  8/14에 이 케이스가 `canSubmitStage`의 한 칸 오차를 잡았다 — 그대로 뒀으면
  신청만 한 팀이 s1을 못 내 첫 제출이 통째로 막혔을 것이다.

  ⚠️ `check`/`checkAction`은 인자를 **수집 시점에 미리 계산한다.** 8/14 스크립트를
  형태 그대로 옮긴 것이라 그렇다. 판정이 순수 함수라 지금은 문제가 없지만, 예외가
  나면 케이스 하나가 아니라 파일 전체가 수집 단계에서 죽는다는 것만 알아둘 것.
*/
import { expect, it } from "vitest";

import { EntryStage, EntryStatus, SeasonPhase } from "@/generated/prisma/enums";
import {
  canAccess,
  canLeaveTeam,
  canManageTeam,
  canSubmitStage,
  type AccessContext,
} from "@/lib/access-policy";
import { featureFlagsSchema } from "@/lib/feature-flags";
import { resolveDashboardState } from "@/lib/dashboard-state";

const flags = featureFlagsSchema.parse({});
const testerOn = featureFlagsSchema.parse({ testerAssignments: true });

function ctx(o: {
  phase: SeasonPhase;
  stage?: EntryStage;
  status?: EntryStatus;
  leader?: boolean;
  admin?: boolean;
  onboarded?: boolean;
  anon?: boolean;
  flags?: typeof flags;
}): AccessContext {
  return {
    user: o.anon
      ? null
      : { id: "u", onboarded: o.onboarded ?? true, isAdmin: o.admin ?? false },
    season: { phase: o.phase, flags: o.flags ?? flags },
    entry: o.stage
      ? {
          stage: o.stage,
          status: o.status ?? EntryStatus.active,
          isLeader: o.leader ?? true,
        }
      : null,
  };
}

function check(
  label: string,
  got: { ok: boolean; code?: string },
  want: string,
) {
  it(label, () => {
    const actual = got.ok ? "ALLOW" : (got as { code: string }).code;
    expect(actual).toBe(want);
  });
}

// ── PLN3 3.2 예외 조합 ────────────────────────────────────────
check(
  "지각 참가 — racing × applied → 대시보드 허용",
  canAccess(
    "dashboard",
    ctx({ phase: SeasonPhase.racing, stage: EntryStage.applied }),
  ),
  "ALLOW",
);
check(
  "탈락팀 접근 — 대시보드는 막지 않는다",
  canAccess(
    "dashboard",
    ctx({
      phase: SeasonPhase.racing,
      stage: EntryStage.s2,
      status: EntryStatus.eliminated,
    }),
  ),
  "ALLOW",
);
check(
  "탈락팀 접근 — 지표 라우트는 404",
  canAccess(
    "dashboardMetrics",
    ctx({
      phase: SeasonPhase.racing,
      stage: EntryStage.s3,
      status: EntryStatus.eliminated,
    }),
  ),
  "NOT_FOUND",
);
check(
  "탈락팀 접근 — 제출 라우트는 404",
  canAccess(
    "dashboardSubmit",
    ctx({
      phase: SeasonPhase.racing,
      stage: EntryStage.s3,
      status: EntryStatus.eliminated,
    }),
  ),
  "NOT_FOUND",
);
/*
  「탈락팀 — 테스터 화면은 열린다」 케이스가 여기 있었다. 시안 v2.1이 상호
  테스터를 보류(시즌2+)로 두고 화면을 만들지 않아 `/dashboard/tester`와 그
  라우트 정책을 지웠다. 시안에 화면이 생기면 이 케이스도 함께 되살린다.
*/
check(
  "레이스 중 실격 — 소명 화면은 열린다",
  canAccess(
    "dashboardAppeal",
    ctx({
      phase: SeasonPhase.racing,
      stage: EntryStage.s4,
      status: EntryStatus.disqualified,
    }),
  ),
  "ALLOW",
);
check(
  "레이스 중 실격 — 팀 관리 쓰기는 막힌다",
  canAccess(
    "dashboardTeam",
    ctx({
      phase: SeasonPhase.racing,
      stage: EntryStage.s4,
      status: EntryStatus.disqualified,
    }),
  ),
  "ENTRY_INACTIVE",
);
check(
  "미배포로 레이스 진입 — s3 상태로 대시보드 허용",
  canAccess(
    "dashboard",
    ctx({ phase: SeasonPhase.racing, stage: EntryStage.s3 }),
  ),
  "ALLOW",
);
check(
  "시즌 종료 후 — 쓰기 화면은 잠긴다",
  canAccess(
    "dashboardTeam",
    ctx({ phase: SeasonPhase.archived, stage: EntryStage.completed }),
  ),
  "STAGE_LOCKED",
);
check(
  "시즌 종료 후 — 조회는 열린다",
  canAccess(
    "dashboardJudgments",
    ctx({ phase: SeasonPhase.archived, stage: EntryStage.completed }),
  ),
  "ALLOW",
);

// ── 기본 규약 ────────────────────────────────────────────────
check(
  "비로그인 — 대시보드 401",
  canAccess("dashboard", ctx({ phase: SeasonPhase.racing, anon: true })),
  "UNAUTHENTICATED",
);
/*
  「온보딩 미완 — 403」이었다. 이름 입력 단계(`auth: "onboarded"`)를 없애면서
  판정이 뒤집혔다 — 시안 v2.1에 온보딩 화면이 없어 `/onboarding`을 지웠고,
  그러면 `onboardedAt`을 채울 자리가 없어 이 403이 영구 잠금이 된다.
  이름은 `/settings`에서 고친다. 시안에 온보딩 화면이 생기면 되돌린다.
*/
check(
  "이름 미입력이어도 대시보드는 열린다",
  canAccess(
    "dashboard",
    ctx({ phase: SeasonPhase.racing, stage: EntryStage.s1, onboarded: false }),
  ),
  "ALLOW",
);
/*
  ⚠️ **허브는 참가 기록이 없어도 열린다**(2026-09-21 수연 지시). 대시보드가
  온보딩의 출발점이라 여기서 막으면 로그인한 사람이 갈 곳이 없어진다 —
  화면이 그때 참가 신청으로 이어 준다. 하위 라우트는 그대로 404다.
*/
check(
  "참가 기록 없음 — 허브는 열린다",
  canAccess("dashboard", ctx({ phase: SeasonPhase.racing })),
  "ALLOW",
);
check(
  "참가 기록 없음 — 팀 관리는 404",
  canAccess("dashboardTeam", ctx({ phase: SeasonPhase.racing })),
  "NOT_FOUND",
);
check(
  "참가 기록 없음 — 제출은 404",
  canAccess("dashboardSubmit", ctx({ phase: SeasonPhase.racing })),
  "NOT_FOUND",
);
/*
  ⚠️ 8/14에 뒤집혔다. 라우트에 leaderOnly를 걸어 팀원에게 403(→404)을 주고 있었는데
  그러면 **팀원이 자기 팀도 못 본다.** PLN3이 정한 것은 「쓰기는 팀장만」이라
  화면은 열고 쓰기만 canManageTeam으로 막는다.
*/
check(
  "팀원(비팀장) — 팀 관리 화면은 보인다",
  canAccess(
    "dashboardTeam",
    ctx({ phase: SeasonPhase.racing, stage: EntryStage.s1, leader: false }),
  ),
  "ALLOW",
);
check(
  "팀원(비팀장) — 팀 관리 쓰기 403",
  canManageTeam(
    ctx({ phase: SeasonPhase.racing, stage: EntryStage.s1, leader: false }),
  ),
  "FORBIDDEN",
);
check(
  "팀장 — 팀 관리 쓰기 허용",
  canManageTeam(ctx({ phase: SeasonPhase.racing, stage: EntryStage.s1 })),
  "ALLOW",
);
check(
  "팀장 — 팀에서 나가기는 막힌다(먼저 이양)",
  canLeaveTeam(ctx({ phase: SeasonPhase.racing, stage: EntryStage.s1 })),
  "FORBIDDEN",
);
check(
  "팀원 — 팀에서 나가기 허용",
  canLeaveTeam(
    ctx({ phase: SeasonPhase.racing, stage: EntryStage.s1, leader: false }),
  ),
  "ALLOW",
);
check(
  "종료된 시즌 — 팀 관리 쓰기 잠김",
  canManageTeam(ctx({ phase: SeasonPhase.archived, stage: EntryStage.s5 })),
  "STAGE_LOCKED",
);
check(
  "플래그 off — 크레딧 404",
  canAccess(
    "dashboardCredits",
    ctx({ phase: SeasonPhase.racing, stage: EntryStage.s1 }),
  ),
  "NOT_FOUND",
);
check(
  "진도 미달 — 지표 409",
  canAccess(
    "dashboardMetrics",
    ctx({ phase: SeasonPhase.racing, stage: EntryStage.s2 }),
  ),
  "STAGE_LOCKED",
);
check(
  "운영자 아님 — /admin 403",
  canAccess("admin", ctx({ phase: SeasonPhase.racing, stage: EntryStage.s1 })),
  "FORBIDDEN",
);
check(
  "운영자 — /admin 허용",
  canAccess("admin", ctx({ phase: SeasonPhase.racing, admin: true })),
  "ALLOW",
);
check(
  "모집 전 — 리더보드 잠김",
  canAccess("leaderboard", ctx({ phase: SeasonPhase.pre_apply, anon: true })),
  "STAGE_LOCKED",
);
check(
  "레이스 — 리더보드 공개",
  canAccess("leaderboard", ctx({ phase: SeasonPhase.racing, anon: true })),
  "ALLOW",
);
/*
  시상·아카이브에서도 열려 있어야 한다. 8/27까지 isRacing이라 시상 발표와 동시에
  잠겼는데, 관전이 가장 몰리는 때가 그때다. 시안 리더보드의 세 번째 상태
  「시즌 종료」가 도달 불가였다.
*/
check(
  "시상 발표 — 리더보드 계속 공개",
  canAccess("leaderboard", ctx({ phase: SeasonPhase.awarded, anon: true })),
  "ALLOW",
);
check(
  "아카이브 — 리더보드 계속 공개",
  canAccess("leaderboard", ctx({ phase: SeasonPhase.archived, anon: true })),
  "ALLOW",
);
check(
  "아카이브 — 참가작 페이지 계속 공개",
  canAccess("projectDetail", ctx({ phase: SeasonPhase.archived, anon: true })),
  "ALLOW",
);
check(
  "모집 전 — 참가작 페이지 잠김",
  canAccess("projectDetail", ctx({ phase: SeasonPhase.pre_apply, anon: true })),
  "STAGE_LOCKED",
);
check(
  "사전신청 구간 — /apply 잠김",
  canAccess("apply", ctx({ phase: SeasonPhase.pre_apply })),
  "STAGE_LOCKED",
);
check(
  "모집 구간 — /apply 열림",
  canAccess("apply", ctx({ phase: SeasonPhase.recruiting })),
  "ALLOW",
);

// ── 제출 ─────────────────────────────────────────────────────
/*
  게이트 판정 대기 — 8/14에 phase(`gate1_review`)에서 팀별 stage로 옮긴 규칙이다.
  s2에 멈춘 팀은 다음(s3)이 잠기지만 s2 자신의 보완 재제출은 열려 있어야 한다.
*/
check(
  "게이트 판정 대기 — 다음 스테이지 잠김",
  canSubmitStage(
    EntryStage.s3,
    ctx({ phase: SeasonPhase.racing, stage: EntryStage.s2 }),
  ),
  "STAGE_LOCKED",
);
check(
  "게이트 판정 대기 — 그 스테이지 재제출은 허용",
  canSubmitStage(
    EntryStage.s2,
    ctx({ phase: SeasonPhase.racing, stage: EntryStage.s2 }),
  ),
  "ALLOW",
);
/*
  제출도 팀 관리와 같이 갈랐다(8/14) — 화면은 팀원도 보고 제출 버튼만 팀장이다.
  팀원이 자기 팀이 무엇을 냈는지 못 보면 2인 팀에서 확인할 방법이 없다.
*/
check(
  "팀원(비팀장) — 제출 화면은 보인다",
  canAccess(
    "dashboardSubmit",
    ctx({ phase: SeasonPhase.racing, stage: EntryStage.s1, leader: false }),
  ),
  "ALLOW",
);
check(
  "팀원(비팀장) — 제출은 403",
  canSubmitStage(
    EntryStage.s2,
    ctx({ phase: SeasonPhase.racing, stage: EntryStage.s1, leader: false }),
  ),
  "FORBIDDEN",
);
check(
  "게이트 통과 후 — 다음 스테이지 열림",
  canSubmitStage(
    EntryStage.s3,
    ctx({ phase: SeasonPhase.racing, stage: EntryStage.s3 }),
  ),
  "ALLOW",
);
/*
  entry.stage는 "마지막으로 완료한 단계"다(API v0.2 §8 게이트 열).
  sN 제출에 필요한 것은 s(N-1)이다 — 이 네 줄이 그 규약을 지킨다.
*/
check(
  "신청만 한 팀 — s1 제출 가능(첫 제출)",
  canSubmitStage(
    EntryStage.s1,
    ctx({ phase: SeasonPhase.recruiting, stage: EntryStage.applied }),
  ),
  "ALLOW",
);
check(
  "신청만 한 팀 — s2는 아직 불가",
  canSubmitStage(
    EntryStage.s2,
    ctx({ phase: SeasonPhase.recruiting, stage: EntryStage.applied }),
  ),
  "STAGE_LOCKED",
);
check(
  "두 단계 앞선 스테이지 — 제출 불가",
  canSubmitStage(
    EntryStage.s4,
    ctx({ phase: SeasonPhase.racing, stage: EntryStage.s1 }),
  ),
  "STAGE_LOCKED",
);
/*
  ⚠️ 이 케이스는 8/14에 뒤집혔다. 원래 `stage=s2 → s3 제출 가능`으로 적어놨는데,
  s2는 게이트라 그 값에 멈춘 팀은 **판정 대기**다(스키마 주석: "값이 s3이면 s2
  게이트를 통과했다는 뜻"). 통과하면 stage가 s3으로 전진하므로 대기 중 s3을
  열어주면 안 된다. 게이트 없는 경계로 바꿔 잡는다 — s3 → s4.
*/
check(
  "바로 다음 스테이지 — 제출 가능(게이트 없는 경계)",
  canSubmitStage(
    EntryStage.s4,
    ctx({ phase: SeasonPhase.racing, stage: EntryStage.s3 }),
  ),
  "ALLOW",
);
check(
  "지난 스테이지 — 재제출 가능",
  canSubmitStage(
    EntryStage.s1,
    ctx({ phase: SeasonPhase.racing, stage: EntryStage.s3 }),
  ),
  "ALLOW",
);

// ═════════════════════════════════════════════════════════════
// PLN3 3.1 「정상 흐름」 9행 — nextAction
// ═════════════════════════════════════════════════════════════
const READY = { teamReady: true, measurementReady: true, depositReady: false };
const NOT_READY = {
  teamReady: false,
  measurementReady: false,
  depositReady: false,
};

function state(o: {
  phase: SeasonPhase;
  stage?: EntryStage;
  status?: EntryStatus;
  onboarding?: typeof READY;
  complete?: boolean;
  flags?: typeof flags;
}) {
  return resolveDashboardState({
    phase: o.phase,
    flags: o.flags ?? flags,
    entry: o.stage
      ? {
          stage: o.stage,
          status: o.status ?? EntryStatus.active,
          isTester: false,
        }
      : null,
    onboarding: o.onboarding ?? READY,
    onboardingComplete: o.complete ?? true,
  });
}

function checkAction(
  label: string,
  got: { nextAction: { key: string } | null },
  want: string | null,
) {
  it(label, () => {
    expect(got.nextAction?.key ?? "null").toBe(want ?? "null");
  });
}

checkAction(
  "3.1 1행 — 모집 × applied × 온보딩 미완 → 팀 구성하기",
  state({
    phase: SeasonPhase.recruiting,
    stage: EntryStage.applied,
    onboarding: NOT_READY,
    complete: false,
  }),
  "onboarding_team",
);
checkAction(
  "3.1 1행 — 팀은 됐고 측정만 남음 → 측정 연동하기",
  state({
    phase: SeasonPhase.recruiting,
    stage: EntryStage.applied,
    onboarding: { ...NOT_READY, teamReady: true },
    complete: false,
  }),
  "onboarding_measurement",
);
checkAction(
  "3.1 2행 — 온보딩 완료 × applied → s1 제출",
  state({ phase: SeasonPhase.recruiting, stage: EntryStage.applied }),
  "submit_s1",
);
checkAction(
  "3.1 3행 — s1 완료 → s2 제출",
  state({ phase: SeasonPhase.racing, stage: EntryStage.s1 }),
  "submit_s2",
);
checkAction(
  "3.1 4행 — s2 완료 → 1차 심사 대기(CTA 없음)",
  state({ phase: SeasonPhase.racing, stage: EntryStage.s2 }),
  null,
);
checkAction(
  "3.1 5행 — s2 통과(s3) → 제품 배포하기",
  state({ phase: SeasonPhase.racing, stage: EntryStage.s3 }),
  "submit_s3",
);
checkAction(
  "3.1 6행 — s4 → 주간 활동 제출",
  state({ phase: SeasonPhase.racing, stage: EntryStage.s4 }),
  "submit_s4",
);
checkAction(
  "3.1 7행 — s5 완료 → 최종 심사 대기(CTA 없음)",
  state({ phase: SeasonPhase.racing, stage: EntryStage.s5 }),
  null,
);
checkAction(
  "3.1 8행 — 시상 × completed → 결과 보기(보증금 off)",
  state({ phase: SeasonPhase.awarded, stage: EntryStage.completed }),
  "result",
);
checkAction(
  "3.1 9행 — 아카이브 → CTA 없음",
  state({ phase: SeasonPhase.archived, stage: EntryStage.completed }),
  null,
);

// ── 3.2 예외 ──────────────────────────────────────────────────
checkAction(
  "3.2 — 실격 팀은 소명으로 보낸다",
  state({
    phase: SeasonPhase.racing,
    stage: EntryStage.s4,
    status: EntryStatus.disqualified,
  }),
  "appeal",
);
/* 테스터 플래그와 무관하게 소명으로 간다 — 테스터 화면이 보류라 지웠다 */
checkAction(
  "3.2 — 탈락 팀 → 소명으로 유도",
  state({
    phase: SeasonPhase.racing,
    stage: EntryStage.s2,
    status: EntryStatus.eliminated,
    flags: testerOn,
  }),
  "appeal",
);
checkAction(
  "게이트 판정 대기(s2) → CTA 없음",
  state({ phase: SeasonPhase.racing, stage: EntryStage.s2 }),
  null,
);

// blockedReasons
const late = state({
  phase: SeasonPhase.racing,
  stage: EntryStage.s3,
  onboarding: { ...READY, measurementReady: false },
});
check(
  "미배포로 레이스 진입 → hostname_not_verified 표시",
  { ok: late.blockedReasons.includes("hostname_not_verified") },
  "ALLOW",
);
