/*
  대시보드가 "지금 무엇을 해야 하는지" 하나로 정하는 곳.

  API 명세서 v0.2 §2.1: "대시보드는 이 엔드포인트 하나로 렌더된다. 프론트가 상태
  판정을 다시 하지 않도록 서버가 결론까지 내려준다." 그 결론이 `nextAction`이고,
  막고 있는 것들이 `blockedReasons`다.

  근거 표는 **PLN3 화면정의서 v0.1 3.1 「정상 흐름」 9행**이다. 아래 분기는 그 표를
  위에서 아래로 그대로 옮긴 것이라, 표가 바뀌면 이 파일만 고친다.

  이 파일은 순수하다 — DB도 세션도 모른다. access-policy.ts와 같은 이유다.

  ⚠️ `entry.stage`는 **마지막으로 완료한 단계**다. `applied`는 "신청만 했다",
  `s2`는 "s2까지 냈고 게이트 판정을 기다린다", `s3`은 "s2 게이트를 통과했다"는 뜻이다
  (API 명세서 v0.2 §8 게이트 열 · 스키마 EntryStage 주석).
*/

import { EntryStage, EntryStatus, type SeasonPhase } from "@/generated/prisma/client";
import type { OnboardingProgress } from "@/lib/access-policy";
import type { FeatureFlags } from "@/lib/feature-flags";
import {
  isArchived,
  isAwarded,
  isPreApply,
  isRacing,
  isRecruiting,
} from "@/lib/season-phase";

/** 대시보드 메인 CTA. 화면은 이 값만 보고 버튼을 그린다 */
export type NextAction = {
  key: string;
  label: string;
  href: string;
};

/**
 * 다음 단계로 못 가게 막고 있는 것. 화면이 체크리스트를 그리는 재료다.
 * 사람이 읽을 문장이 아니라 키다 — 문구는 화면이 정한다(같은 사유도 자리마다 다르게 쓴다).
 */
export type BlockedReason =
  /** 팀 구성이 덜 됐다(2인 팀인데 초대 수락 전) */
  | "team_not_ready"
  /** 측정 연동이 검증되지 않았다. 배포 완료의 조건이다 */
  | "hostname_not_verified"
  /** 게이트 심사 중이라 제출이 잠겼다 */
  | "gate_review"
  /** 게이트 미통과 */
  | "entry_eliminated"
  /** 규칙 위반 실격 */
  | "entry_disqualified"
  /** 자진 포기 */
  | "entry_withdrawn"
  /** 시즌이 아직 시작하지 않았다 */
  | "season_not_started"
  /** 종료된 시즌이라 읽기 전용이다 */
  | "season_archived";

export type DashboardInput = {
  phase: SeasonPhase;
  flags: FeatureFlags;
  entry: { stage: EntryStage; status: EntryStatus; isTester: boolean } | null;
  onboarding: OnboardingProgress;
  /** 온보딩 완료 판정. 조건이 미정이라(PLN3 미결 2번) 바깥에서 주입받는다 */
  onboardingComplete: boolean;
};

export type DashboardState = {
  nextAction: NextAction | null;
  blockedReasons: BlockedReason[];
};

/*
  "레이스 참여중" 같은 파생 상태를 저장하지 않는 것이 원칙이다
  (PLN3 3.1 각주 · PLN2 9장 FR-S3). 계산이 싸고, 저장하면 두 값이 어긋난다.
*/
export function resolveDashboardState(input: DashboardInput): DashboardState {
  /*
    `flags`는 아직 안 읽는다. 보증금·테스터 분기가 빠지면서 유일한 독자가
    없어졌는데, 입력에서는 지우지 않았다 — 시안 허브 17상태에는 크레딧 센터
    플래그로 갈리는 자리가 남아 있어 허브를 옮길 때 다시 쓴다.
  */
  const { phase, entry, onboarding, onboardingComplete } = input;
  const blocked: BlockedReason[] = [];

  // 참가 기록이 없다 — 대시보드에 올 일이 없지만 방어한다
  if (!entry) {
    return { nextAction: null, blockedReasons: [] };
  }

  // ── 생존 상태가 먼저다. 진도보다 앞선다 ────────────────────
  if (entry.status === EntryStatus.disqualified) {
    blocked.push("entry_disqualified");
    /* 실격 팀에게 열려 있는 유일한 길이 소명이다. 막으면 분쟁 창구가 사라진다 */
    return {
      nextAction: { key: "appeal", label: "소명 제출하기", href: "/dashboard/appeal" },
      blockedReasons: blocked,
    };
  }
  if (entry.status === EntryStatus.withdrawn) {
    return { nextAction: null, blockedReasons: ["entry_withdrawn"] };
  }
  if (entry.status === EntryStatus.eliminated) {
    blocked.push("entry_eliminated");
    /*
      PLN3 3.2 「탈락팀 접근」 — 대시보드를 막지 않는다.

      ⚠️ 상호 테스터로 유도하던 분기를 뺐다. 시안 v2.1이 테스터를 **보류(시즌2+)**
      로 두고 화면을 만들지 않아 `/dashboard/tester`를 지웠다. 시안의 대응 상태
      (허브 h12 「1차 심사 결과, 미통과」)도 소명·다음 시즌만 보여준다.
    */
    return {
      nextAction: {
        key: "appeal",
        label: "결과에 이의 제기하기",
        href: "/dashboard/appeal",
      },
      blockedReasons: blocked,
    };
  }

  // ── 시즌이 끝났거나 아직 안 열렸다 ─────────────────────────
  if (isArchived(phase)) {
    // PLN3 3.1 마지막 행 — 시즌 요약(읽기 전용), CTA 없음
    return { nextAction: null, blockedReasons: ["season_archived"] };
  }
  if (isAwarded(phase)) {
    /*
      PLN3 3.1 8행 — 결과·수상 내역.

      ⚠️ 보증금 환불 신청 분기를 뺐다. 시안 v2.1이 보증금을 **보류(도입 미정)** 로
      두고 화면을 만들지 않아 `/dashboard/deposit`을 지웠다. 시안의 대응 상태
      (허브 h8 「시즌 1 결과」)는 환불 항목을 「⚠️ 도입 미정」 배지로만 남긴다.
    */
    return {
      nextAction: {
        key: "result",
        label: "결과 보기",
        href: "/dashboard/judgments",
      },
      blockedReasons: blocked,
    };
  }
  if (isPreApply(phase)) {
    return { nextAction: null, blockedReasons: ["season_not_started"] };
  }

  // ── 온보딩 — PLN3 3.1 1행 ────────────────────────────────
  if (entry.stage === EntryStage.applied && !onboardingComplete) {
    /*
      체크리스트 순서가 곧 CTA다: 팀 구성하기 → 측정 연동하기.
      둘 다 남았으면 앞의 것을 먼저 보여준다 — 화면에 버튼이 둘이면
      "무엇을 해야 하는지 하나만 보여준다"는 대시보드의 목적이 깨진다.
    */
    if (!onboarding.teamReady) blocked.push("team_not_ready");
    if (!onboarding.measurementReady) blocked.push("hostname_not_verified");

    if (!onboarding.teamReady) {
      return {
        nextAction: { key: "onboarding_team", label: "팀 구성하기", href: "/dashboard/team" },
        blockedReasons: blocked,
      };
    }
    /*
      뒤에 「보증금 결제하기」 분기가 하나 더 있었다. 보증금이 보류라 화면을
      지웠고, 애초에 `ONBOARDING_REQUIRES_DEPOSIT`이 false여서 이 자리까지
      내려오지 못하는 죽은 가지였다. 온보딩은 시안(허브 h1)대로 두 단계다.
    */
    return {
      nextAction: {
        key: "onboarding_measurement",
        label: "측정 연동하기",
        href: "/dashboard/measurement",
      },
      blockedReasons: blocked,
    };
  }

  /*
    ── 진도별 다음 제출 — PLN3 3.1 2·3·5·6행 ─────────────────

    8/14까지 이 위에 `isGateReview(phase)` 분기가 한 겹 더 있었다. phase가 6값으로
    합쳐져 그 구간이 없어졌지만 **잃은 판정은 없다** — 심사 대기는 아래 표에서
    s2·s5가 `null`을 내는 것으로 이미 표현되고(3.1 4·7행), 그게 팀별로도 맞다.
  */
  const byStage: Record<EntryStage, NextAction | null> = {
    /* 온보딩을 마쳤으면 s1이 다음이다(3.1 2행) */
    applied: { key: "submit_s1", label: "등록 정보 제출하기", href: "/dashboard/submit/s1" },
    s1: { key: "submit_s2", label: "랜딩 만들고 제출하기", href: "/dashboard/submit/s2" },
    /* s2까지 냈다 = 1차 게이트 판정 대기(3.1 4행) */
    s2: null,
    s3: { key: "submit_s3", label: "제품 배포하기", href: "/dashboard/submit/s3" },
    /* s4는 주간 반복이라 매주 다시 뜬다(PLN6 1장) */
    s4: { key: "submit_s4", label: "이번 주 활동 제출하기", href: "/dashboard/submit/s4" },
    /* s5까지 냈다 = 최종 심사 대기(3.1 7행) */
    s5: null,
    completed: { key: "result", label: "결과 보기", href: "/dashboard/judgments" },
  };

  const nextAction = byStage[entry.stage];
  if (!nextAction && (entry.stage === EntryStage.s2 || entry.stage === EntryStage.s5)) {
    blocked.push("gate_review");
  }

  /*
    미배포로 레이스에 들어온 팀(PLN3 3.2 4행) — 참여는 허용하되 연동이 안 끝났다는
    사실은 계속 알려준다. 리더보드에 "미배포"로 뜨고 지표가 0이 되는 이유가 이것이다.
  */
  if (isRacing(phase) && !onboarding.measurementReady) {
    blocked.push("hostname_not_verified");
  }
  /* 모집 구간인데 아직 시즌이 안 열렸다는 표시는 하지 않는다 — 신청 자체가 정상 행동이다 */
  if (!isRacing(phase) && !isRecruiting(phase)) {
    blocked.push("season_not_started");
  }

  return { nextAction, blockedReasons: blocked };
}
