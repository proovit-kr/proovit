/*
  접근 판정의 **순수** 절반이다. DB도 세션도 건드리지 않는다.

  access.ts에서 갈라낸 이유는 취향이 아니라 강제다 — 그쪽은 prisma를 import하는데,
  판정 표나 타입만 필요한 곳(클라이언트 컴포넌트·테스트·엣지)이 그걸 따라 끌고 오면
  `node:module`이 번들에 딸려가 빌드가 통째로 깨진다. profile.ts / profile-store.ts를
  가른 것과 같은 이유다(2026-08-12에 실제로 깨뜨려 봤다).

  **바깥에서는 access.ts를 통해 쓴다.** 거기서 이 파일을 다시 내보내므로
  "접근 판정은 한 자리"(CLAUDE.md §3)는 그대로 지켜진다.

  근거 문서는 PLN3 화면정의서 v0.1(8/13) 2장 카탈로그 · 3장 phase×stage 분기표다.
*/

import {
  EntryStage,
  EntryStatus,
  type SeasonPhase,
} from "@/generated/prisma/client";
import type { ApiErrorCode } from "@/lib/api";
import type { FeatureFlagKey, FeatureFlags } from "@/lib/feature-flags";
import {
  isArchived,
  isRacingOrLater,
  isRecruiting,
} from "@/lib/season-phase";

// ═════════════════════════════════════════════════════════════
// canAccess — 시즌 페이즈 × 참가 진도 × 생존 상태 × 기능 플래그
// ═════════════════════════════════════════════════════════════

/*
  진도는 순서가 있지만 Postgres enum은 대소 비교를 보장하지 않는다(CLAUDE.md §4).
  phase 쪽 PHASE_RANK와 같은 이유로 상수 맵을 둔다.
*/
const STAGE_RANK: Record<EntryStage, number> = {
  applied: 0,
  s1: 1,
  s2: 2,
  s3: 3,
  s4: 4,
  s5: 5,
  completed: 6,
};

export function stageAtLeast(stage: EntryStage, min: EntryStage): boolean {
  return STAGE_RANK[stage] >= STAGE_RANK[min];
}

/**
 * sN을 제출하려면 어느 진도까지 와 있어야 하는가 — API 명세서 v0.2 §8 게이트 열.
 * `entry.stage`가 "마지막으로 완료한 단계"라서 한 칸 앞을 본다.
 * `completed`는 제출 대상이 아니라 자기 자신을 요구값으로 둔다(도달 불가 = 항상 잠김).
 */
const SUBMIT_PREREQUISITE: Record<EntryStage, EntryStage> = {
  applied: EntryStage.applied,
  s1: EntryStage.applied,
  s2: EntryStage.s1,
  s3: EntryStage.s2,
  s4: EntryStage.s3,
  s5: EntryStage.s4,
  completed: EntryStage.completed,
};

/*
  게이트 스테이지 — 제출 뒤에 판정이 붙는 단계. 시즌1은 s2·s5 두 번이다(PLN6 1장).

  ⚠️ 정본은 `stages.is_gate` 컬럼이다. 여기 상수를 두는 이유는 이 파일이 DB를
  못 읽는 순수 판정이기 때문이다. 시즌마다 게이트 위치가 달라지면 ctx로 받는다.
*/
const GATE_STAGES: readonly EntryStage[] = [EntryStage.s2, EntryStage.s5];

/**
 * 게이트 판정을 기다리는 중인가.
 *
 * **2026-08-14에 `isGateReview(phase)`를 대체했다.** phase가 6값으로 합쳐지면서
 * `gate1_review`·`gate2_review` 구간이 없어졌는데, 애초에 심사 대기는 시즌 전체가
 * 아니라 팀별 상태다 — 같은 시각에 통과한 팀은 다음 단계를 만들고 있다.
 *
 * `entry.stage`는 "마지막으로 완료한 단계"이고 게이트를 통과하면 다음 값으로
 * 전진한다. 그래서 게이트 스테이지에 멈춘 팀이 곧 판정 대기다. 탈락은 stage가
 * 아니라 `status`(eliminated)로 나타나므로 여기서 보지 않는다.
 *
 * ✅ **전진 규칙은 동혁이 확인해 줬다(2026-08-14 스크럼): "팀별로 게이트 통과하면
 * 스테이지 값 올라갑니다."** 스키마 주석("값이 s3이면 s2 게이트를 통과했다는 뜻")과
 * 같은 말이다. 이 전제가 뒤집히면 잠금이 반대로 걸리므로 근거를 여기 남긴다.
 */
export function isAwaitingGate(stage: EntryStage): boolean {
  return GATE_STAGES.includes(stage);
}

/** PLN3 2장 카탈로그의 화면 하나에 대응한다. 라우트 문자열을 키로 쓰지 않는 이유는 오타가 조용히 통과하기 때문이다. */
export type RouteKey =
  // 공개
  | "landing"
  | "seasonDetail"
  | "rules"
  | "leaderboard"
  | "projectDetail"
  // 참가자
  | "apply"
  | "dashboard"
  | "dashboardTeam"
  | "dashboardMeasurement"
  | "dashboardPayment"
  | "dashboardSubmit"
  | "dashboardMetrics"
  | "dashboardJudgments"
  | "dashboardAppeal"
  | "dashboardCredits"
  | "notifications"
  | "settings"
  // 운영자
  | "admin"
  | "adminSeasons"
  | "adminEntries"
  | "adminJudging"
  | "adminMetrics"
  | "adminLeads"
  | "adminAbuse"
  | "adminNotifications"
  | "adminAuditLogs"
  | "adminAwards"
  | "adminSponsors";

type RoutePolicy = {
  /*
    누가 들어올 수 있나.

    ⚠️ 8/28까지 `"onboarded"`(로그인 + 이름 입력 완료)가 한 단계 더 있었다.
    시안 v2.1 화면 레지스트리에 온보딩 화면이 없어 `/onboarding`을 지웠고,
    그러면 `onboardedAt`을 채울 자리가 사라져 전 참가자가 영구 403이 된다.
    단계를 없애는 대신 이름은 `/settings`에서 고친다.
  */
  auth: "public" | "user" | "admin";
  /** 이 플래그가 꺼져 있으면 404. 있다는 사실 자체를 숨긴다 */
  flag?: FeatureFlagKey;
  /** 참가 기록이 있어야 열린다. 없으면 404 */
  entry?: boolean;
  /** 이 진도 이상이어야 열린다. 미달이면 409 STAGE_LOCKED */
  minStage?: EntryStage;
  /** 시즌 페이즈 조건. 값이 아니라 술어를 받는다(ADR-008 대비 — season.ts 주석) */
  phase?: (phase: SeasonPhase) => boolean;
  /** 쓰기 화면. status가 active가 아니면 409 ENTRY_INACTIVE */
  write?: boolean;
  /** 팀 단위 쓰기는 팀장만(요구사항 명세서 G5). 팀원은 조회만 */
  leaderOnly?: boolean;
  /** status가 active가 아니어도 열린다. 소명이 여기 든다 — 막으면 분쟁 창구가 사라진다 */
  allowInactive?: boolean;
  /**
   * 게이트에서 떨어진 팀(`eliminated`)에게 숨긴다.
   * PLN3 3.2 「탈락팀 접근」: 대시보드는 막지 않고 지표·제출 라우트만 404다.
   * 대시보드까지 막으면 소명·테스터로 갈 길이 없어진다.
   */
  hideWhenEliminated?: boolean;
};

/*
  PLN3 2장 카탈로그 30행을 그대로 옮긴 표다. 조건을 화면 파일에 흩뿌리지 않고
  여기 한 곳에 모으는 것이 이 파일의 존재 이유다.

  ⚠️ 라우트 이름은 PLN3을 따른다 — 제출은 `/dashboard/submit/:stageKey`다.
  옛 문서의 `/dashboard/submissions/:stage`·`/dashboard/sub/stepN`이 아니다.
*/
const ROUTE_POLICY: Record<RouteKey, RoutePolicy> = {
  // ── 공개 ──────────────────────────────────────────────────
  landing: { auth: "public" },
  seasonDetail: { auth: "public" },
  rules: { auth: "public" },
  /*
    관전 트래픽의 목적지. 레이스에 들어가야 숫자가 생긴다.

    ⚠️ 끝나면 닫지 **않는다**. 2026-08-27까지 `isRacing`이라 시상 발표와 동시에
    잠겼는데, 관전이 가장 몰리는 때가 그때다. 시안의 리더보드 세 번째 상태
    (시즌 종료, FINAL 배너)도 이 화면이 시즌 뒤에 살아 있다는 전제다.
  */
  leaderboard: { auth: "public", flag: "leaderboard", phase: isRacingOrLater },
  /** 참가작 공개 페이지. 레이스 전에는 보여줄 것이 없다. 끝난 뒤에는 남는다 */
  projectDetail: { auth: "public", phase: isRacingOrLater },

  // ── 참가자 ────────────────────────────────────────────────
  /** 참가 신청. 모집 구간에만 열린다 */
  apply: { auth: "user", phase: isRecruiting, write: true },
  /** 골든패스 진입점. 탈락·실격 팀도 들어와야 소명·테스터로 갈 수 있다 */
  dashboard: { auth: "user", entry: true, allowInactive: true },
  /*
    ⚠️ leaderOnly를 걸지 않는다. 걸면 FORBIDDEN → 404가 되어 **팀원이 자기 팀을
    못 본다** — 팀원 목록도, 팀장이 누구인지도. PLN3이 정한 것은 「쓰기는 팀장만」이고
    그 쓰기 판정은 아래 `canManageTeam()`이 한다(제출 잠금을 `canSubmitStage`로
    가른 것과 같은 형태다).
  */
  dashboardTeam: { auth: "user", entry: true, write: true },
  /** 측정 연동은 온보딩의 절반이라 진도 조건을 걸지 않는다 */
  dashboardMeasurement: {
    auth: "user",
    entry: true,
    write: true,
    leaderOnly: true,
  },
  /** PG 조회키 등록. 배포(s3) 후부터 의미가 있다(API v0.2 §7) */
  dashboardPayment: {
    auth: "user",
    entry: true,
    minStage: EntryStage.s3,
    write: true,
    leaderOnly: true,
  },
  /** 스테이지 제출. 스테이지별 개별 조건은 canSubmitStage가 따로 본다 */
  /*
    ⚠️ 팀 관리와 같은 이유로 leaderOnly를 걸지 않는다 — 걸면 팀원이 **자기 팀이 무엇을
    냈는지도 못 본다.** 제출 버튼은 팀장만이라는 규칙은 `canSubmitStage()`가 지킨다.
  */
  dashboardSubmit: {
    auth: "user",
    entry: true,
    write: true,
    hideWhenEliminated: true,
  },
  /** 본인 지표. 배포 전에는 집계 자체가 없다(API v0.2 §10) */
  dashboardMetrics: {
    auth: "user",
    entry: true,
    minStage: EntryStage.s3,
    hideWhenEliminated: true,
  },
  /** 심사 결과. 첫 게이트(s2)를 지나야 판정이 생긴다(API v0.2 §9.1) */
  dashboardJudgments: {
    auth: "user",
    entry: true,
    minStage: EntryStage.s2,
    allowInactive: true,
  },
  /** 소명. 실격 팀에게 열려 있어야 하는 유일한 쓰기 화면이다 */
  dashboardAppeal: {
    auth: "user",
    entry: true,
    write: true,
    leaderOnly: true,
    allowInactive: true,
  },
  dashboardCredits: {
    auth: "user",
    entry: true,
    flag: "credits",
    minStage: EntryStage.s1,
  },
  notifications: { auth: "user", flag: "notifications" },
  /** 계정 설정. 참가하지 않은 회원도 쓴다 */
  settings: { auth: "user" },

  // ── 운영자 ────────────────────────────────────────────────
  admin: { auth: "admin" },
  adminSeasons: { auth: "admin", write: true },
  adminEntries: { auth: "admin", write: true },
  adminJudging: { auth: "admin", write: true },
  adminMetrics: { auth: "admin", write: true },
  adminLeads: { auth: "admin" },
  adminAbuse: { auth: "admin", write: true },
  adminNotifications: { auth: "admin", write: true },
  adminAuditLogs: { auth: "admin" },
  adminAwards: { auth: "admin", write: true },
  adminSponsors: { auth: "admin", flag: "sponsors", write: true },
};

/** 판정에 필요한 것 전부. 화면·핸들러가 이걸 만들어 넘긴다 */
export type AccessContext = {
  user: { id: string; onboarded: boolean; isAdmin: boolean } | null;
  season: { phase: SeasonPhase; flags: FeatureFlags } | null;
  /** 참가 기록. 회원이지만 참가하지 않았으면 null */
  entry: {
    stage: EntryStage;
    status: EntryStatus;
    /** 팀장인가. 팀 단위 쓰기의 조건(G5) */
    isLeader: boolean;
  } | null;
};

export type AccessResult =
  | { ok: true }
  | {
      ok: false;
      code: Extract<
        ApiErrorCode,
        | "UNAUTHENTICATED"
        | "FORBIDDEN"
        | "NOT_FOUND"
        | "STAGE_LOCKED"
        | "ENTRY_INACTIVE"
      >;
      message: string;
      details?: { currentStage: string | null; requiredStage: string | null };
    };

const ALLOW: AccessResult = { ok: true };

/**
 * 접근 판정. **순서가 규약이다** — API 명세서 v0.2 §0.7.
 *
 * 먼저 걸리는 것이 응답을 결정한다. 순서를 바꾸면 같은 상황에 다른 코드가 나가고,
 * 그중 일부는 정보를 흘린다. 예를 들어 플래그 판정을 롤 판정보다 앞에 두면
 * 권한 없는 사람이 "이 기능은 꺼져 있다"는 사실을 알게 된다.
 */
export function canAccess(route: RouteKey, ctx: AccessContext): AccessResult {
  const policy = ROUTE_POLICY[route];

  // 1) 인증 — 401
  if (policy.auth !== "public") {
    if (!ctx.user) {
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        message: "로그인이 필요합니다.",
      };
    }
    if (policy.auth === "admin" && !ctx.user.isAdmin) {
      /*
        운영자 화면은 403이 맞다. 404로 숨기면 운영자 본인이 권한을 잃었을 때
        "없어졌다"로 읽혀 원인을 못 찾는다. 플래그 off와 달리 존재는 공개된 사실이다.
      */
      return { ok: false, code: "FORBIDDEN", message: "접근 권한이 없습니다." };
    }
  }

  // 2) 참가 기록 — 없으면 404
  if (policy.entry && !ctx.entry) {
    return { ok: false, code: "NOT_FOUND", message: "참가 기록이 없습니다." };
  }

  // 3) 생존 상태 — 쓰기 차단(409) · 탈락 팀에게 숨김(404)
  if (ctx.entry) {
    const inactive = ctx.entry.status !== EntryStatus.active;

    if (
      policy.hideWhenEliminated &&
      ctx.entry.status === EntryStatus.eliminated
    ) {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: "지금은 이용할 수 없습니다.",
      };
    }
    if (inactive && policy.write && !policy.allowInactive) {
      return {
        ok: false,
        code: "ENTRY_INACTIVE",
        message:
          ctx.entry.status === EntryStatus.disqualified
            ? "실격 상태에서는 수정할 수 없습니다. 소명 화면에서 이의를 제기할 수 있습니다."
            : "지금 상태에서는 수정할 수 없습니다.",
      };
    }
    // 팀 단위 쓰기는 팀장만(G5). 팀원은 조회만 한다
    if (policy.leaderOnly && !ctx.entry.isLeader) {
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "팀장만 할 수 있습니다.",
      };
    }
  }

  // 4) 기능 플래그 — 404. "있는데 못 본다"(403)가 아니라 "없다"로 숨긴다
  if (policy.flag && ctx.season && !ctx.season.flags[policy.flag]) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "지금은 이용할 수 없습니다.",
    };
  }

  // 5) 시즌 페이즈 — 아카이브는 전 화면 읽기 전용(G4)
  if (ctx.season) {
    if (isArchived(ctx.season.phase) && policy.write) {
      return {
        ok: false,
        code: "STAGE_LOCKED",
        message: "종료된 시즌입니다. 조회만 할 수 있습니다.",
        details: { currentStage: "archived", requiredStage: null },
      };
    }
    if (policy.phase && !policy.phase(ctx.season.phase)) {
      return {
        ok: false,
        code: "STAGE_LOCKED",
        message: "아직 열리지 않았습니다.",
        details: { currentStage: ctx.season.phase, requiredStage: null },
      };
    }
  }

  // 6) 진도 — 409 STAGE_LOCKED
  if (
    policy.minStage &&
    ctx.entry &&
    !stageAtLeast(ctx.entry.stage, policy.minStage)
  ) {
    return {
      ok: false,
      code: "STAGE_LOCKED",
      message: "아직 이 단계에 도달하지 않았습니다.",
      details: {
        currentStage: ctx.entry.stage,
        requiredStage: policy.minStage,
      },
    };
  }

  return ALLOW;
}

/**
 * 스테이지 제출 가능 여부. `dashboardSubmit` 정책을 통과한 뒤 한 겹 더 본다.
 *
 * 제출은 라우트가 하나(`/dashboard/submit/:stageKey`)인데 조건이 스테이지마다
 * 다르다 — 자기 진도보다 앞선 스테이지는 열리지 않고, 게이트 심사 중에는
 * 전부 잠긴다. 그걸 ROUTE_POLICY에 담으면 표가 스테이지 수만큼 늘어난다.
 */
export function canSubmitStage(
  stageKey: EntryStage,
  ctx: AccessContext,
): AccessResult {
  const base = canAccess("dashboardSubmit", ctx);
  if (!base.ok) return base;
  if (!ctx.entry || !ctx.season) {
    return { ok: false, code: "NOT_FOUND", message: "참가 기록이 없습니다." };
  }

  /*
    제출은 팀 단위 쓰기라 팀장만 누른다(G5 · 스키마 `submissions.submitted_by` 주석).
    화면은 팀원에게도 열려 있어서 이 판정이 라우트가 아니라 여기 있다.
  */
  if (!ctx.entry.isLeader) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "제출은 팀장만 할 수 있습니다.",
    };
  }

  /*
    게이트 판정을 기다리는 동안은 **다음** 스테이지가 잠긴다
    (06 §4.2 · PLN3 3.1 「심사 대기 안내 — 없음(잠김)」).

    8/14까지는 phase(`gate1_review`)로 봤는데 6값으로 합쳐지며 그 구간이 없어졌다.
    팀별로 봐야 맞기도 하다 — 같은 시각에 통과한 팀은 이미 다음을 만들고 있다.

    잠그는 것은 다음 스테이지뿐이고 **게이트 스테이지 자신의 재제출은 열어둔다**
    (보완 재제출이 정상 경로다 · `revision_due_at`이 마감을 따로 본다).
  */
  const prerequisite = SUBMIT_PREREQUISITE[stageKey];
  if (isAwaitingGate(prerequisite) && ctx.entry.stage === prerequisite) {
    return {
      ok: false,
      code: "STAGE_LOCKED",
      message: "심사 결과가 나온 뒤에 제출할 수 있습니다.",
      details: { currentStage: ctx.entry.stage, requiredStage: stageKey },
    };
  }

  /*
    ⚠️ `entry.stage`는 **마지막으로 완료한 단계**다. "지금 하는 단계"가 아니다.

    근거는 API 명세서 v0.2 §8 게이트 열이다 — `PUT s1`의 조건이 `applied`,
    `PUT s2`가 `s1`, `PUT s3`이 `s2 통과`다. 스키마 주석도 같은 말을 한다:
    "값이 s3이면 s2 게이트를 통과했다는 뜻이다(전진 자체가 통과의 근거)".

    그래서 필요한 진도는 stageKey 자신이 아니라 **그 앞 단계**다.
    stageKey 자신으로 비교하면 `applied` 팀이 s1을 못 내 첫 제출이 통째로 막힌다.

    같거나 지난 것은 열어둔다 — 재제출이 정상 경로다(PLN3 2장 「재제출」).
    마감 이후 잠금은 `stages.closes_at`·`revision_due_at`이 따로 판정한다.
  */
  if (!stageAtLeast(ctx.entry.stage, prerequisite)) {
    return {
      ok: false,
      code: "STAGE_LOCKED",
      message: `${stageKey} 제출은 이전 단계를 마친 팀만 할 수 있습니다.`,
      details: { currentStage: ctx.entry.stage, requiredStage: prerequisite },
    };
  }

  return ALLOW;
}

/**
 * 팀 관리 **쓰기** 가능 여부 — 초대 발급·취소, 팀장 이양, 강퇴.
 *
 * 화면 보기와 쓰기를 가른 이유는 팀원이다. 라우트 정책에 `leaderOnly`를 걸면
 * FORBIDDEN이 404로 덮여 팀원이 자기 팀조차 못 본다. PLN3이 정한 것은
 * 「쓰기는 팀장만」(G5)이지 「화면은 팀장만」이 아니다.
 *
 * 화면은 이 판정으로 폼을 그릴지 정하고, **서버 액션은 같은 함수를 다시 부른다** —
 * 액션은 폼을 거치지 않고 직접 호출할 수 있는 엔드포인트다.
 *
 * 본인 탈퇴는 여기 걸리지 않는다(팀원이 하는 일이다). 그건 `canLeaveTeam`이 본다.
 */
export function canManageTeam(ctx: AccessContext): AccessResult {
  const base = canAccess("dashboardTeam", ctx);
  if (!base.ok) return base;
  if (!ctx.entry) {
    return { ok: false, code: "NOT_FOUND", message: "참가 기록이 없습니다." };
  }
  if (!ctx.entry.isLeader) {
    return { ok: false, code: "FORBIDDEN", message: "팀장만 할 수 있습니다." };
  }
  return ALLOW;
}

/**
 * 팀에서 나갈 수 있는가.
 *
 * **팀장은 못 나간다** — 나가면 그 팀의 쓰기 주체가 사라져 제출도 초대도 막힌다
 * (`team_members_one_leader` 부분 유니크 인덱스가 팀장 없는 상태를 허용한다).
 * 먼저 이양하게 한다.
 */
export function canLeaveTeam(ctx: AccessContext): AccessResult {
  const base = canAccess("dashboardTeam", ctx);
  if (!base.ok) return base;
  if (!ctx.entry) {
    return { ok: false, code: "NOT_FOUND", message: "참가 기록이 없습니다." };
  }
  if (ctx.entry.isLeader) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "팀장은 먼저 팀장을 넘겨야 나갈 수 있습니다.",
    };
  }
  return ALLOW;
}

/*
  ⚠️ **온보딩 완료 조건이 아직 미정이다** — PLN3 미결 2번.
  "팀 구성 + 측정 연동"까지는 확정이고, 보증금 결제를 넣을지가 열려 있다
  (보증금 도입 자체가 미정이라 두 겹으로 걸려 있다).

  PLN3 1장이 정한 것: 온보딩은 `entry.stage`의 저장값이 **아니다.**
  현재 EntryStage 7값에 `onboarded`가 없으므로 **파생 계산**한다.

  8/17에 결론이 나면 아래 상수 한 줄과 함수 본문만 고친다. 이 판정이
  대시보드 첫 분기(PLN3 3.1 첫 행)를 가르므로 화면에 흩뿌리면 안 된다.
*/
const ONBOARDING_REQUIRES_DEPOSIT = false;

export type OnboardingProgress = {
  /** 팀 구성 완료 — 1인 팀이면 자동, 2인 팀이면 초대 수락까지 */
  teamReady: boolean;
  /** 측정 연동 검증 완료. 배포 완료로 인정되는 조건이다 */
  measurementReady: boolean;
  /** 보증금 결제 완료. 도입 자체가 미정이라 플래그가 꺼져 있으면 판정에 안 쓴다 */
  depositReady: boolean;
};

export function isOnboardingComplete(progress: OnboardingProgress): boolean {
  if (!progress.teamReady || !progress.measurementReady) return false;
  return ONBOARDING_REQUIRES_DEPOSIT ? progress.depositReady : true;
}
