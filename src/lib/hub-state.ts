/*
  대시보드 허브가 **어느 화면인가**를 정하는 곳.

  시안 `#scr-hub`의 `<select id="hubSel">`가 17종을 나열한다 — 「정상 흐름」
  아홉(h1~h9)과 「예외」 여덟(h10~h17)이다. 이 파일이 그중 열넷을 낸다.
  나머지 셋은 여기가 낼 수 없는 자리다.

    h17  **이번 시즌에 참가 기록이 없는 사람**이라 여기까지 오지 않는다
         (`page.tsx`가 지난 시즌 기록을 보고 그린다. 문구는 `HUB_NO_ENTRY.next`)

  h16(종료 후 쓰기 시도)은 DB 상태가 h9와 같다 — 갈리는 것은 「방금 쓰려고
  했다」는 사건이라 `writeAttempt`로 받는다(`page.tsx`가 정한다).

  이 파일은 순수하다. `dashboard-state.ts`와 같은 이유다 — DB도 세션도 모른다.

  ⚠️ **`dashboard-state.ts`를 대신하지 않는다.** 저쪽은 「다음에 할 일 하나」를
  정하고 `/api/v1/me`가 같이 쓴다. 여기는 **그릴 판을 고르는 것**뿐이라 둘의
  결론이 어긋날 수 없다 — 화면은 pane을 이 파일에서, CTA를 저 파일에서 받는다.

  ⚠️ `entry.stage`는 **마지막으로 완료한 단계**다(스키마 EntryStage 주석).
  `applied`는 「신청만 했다」, `s2`는 「s2까지 냈고 판정을 기다린다」는 뜻이다.
*/

import {
  EntryStage,
  EntryStatus,
  StageKey,
  type SeasonPhase,
} from "@/generated/prisma/client";
import { isArchived, isAwarded, isPreApply, isRacing } from "@/lib/season-phase";

/**
 * 허브가 그리는 판. 뒤의 주석이 시안 `#hubSel`의 값이다.
 *
 * ⚠️ 이름을 바꾸면 대조 스크립트(`scripts/design-diff/hub.mjs`)의 상태 가드와
 * 어긋난다 — 그쪽은 구현이 지금 어느 판을 그리는지 먼저 찍는다.
 */
export type HubPane =
  /** h1, 온보딩 미완료 */
  | "onboarding"
  /** h2, s1 제출 전 */
  | "s1"
  /** h3, s2 진행 중 */
  | "s2"
  /** h4, 1차 심사 대기 */
  | "gate1"
  /** h5, s3 빌드와 배포 */
  | "s3"
  /** h6, s4 레이스 */
  | "race"
  /** h7, 2차 심사 대기 */
  | "gate2"
  /** h8, 시상 발표 */
  | "awarded"
  /** h9, 시즌 아카이브 */
  | "archived"
  /** h10, 지각 참가 */
  | "late"
  /** h11, 게이트 미제출 탈락 */
  | "missed"
  /** h12, 탈락팀 접근 — 게이트 미통과 */
  | "gateFail"
  /** h13, 미배포 레이스 */
  | "undeployed"
  /** h14, 레이스 중 실격 */
  | "disqualified"
  /** h15, s5 자동 제출 확인 */
  | "s5"
  /** h16, 종료 후 쓰기 시도 */
  | "readonly";

export type HubInput = {
  phase: SeasonPhase;
  entry: { stage: EntryStage; status: EntryStatus } | null;
  onboardingComplete: boolean;
  /**
   * 측정 연동이 끝났는가. **리더보드의 「미배포」와 같은 판정이다**
   * (`race.ts`의 `notDeployed`, access.ts의 `measurementReady`) —
   * 그래서 시안 h13이 「리더보드에 미배포로 표시되고」라고 말할 수 있다.
   * 리더보드 쪽은 2026-09-26부터 「레이스 전(s3 미제출)」도 미배포로 세지만,
   * 이 판(h13)은 s4 진도 — s3을 낸 뒤 — 에서만 나오므로 둘이 같은 말을 한다.
   */
  measurementReady: boolean;
  /**
   * 지금 열린 스테이지. 레이스에서 h6과 h15를 가르는 유일한 축이다.
   * **달력** 기준이다 — 유동 게이트(2026-09-25)에서도 s5는 달력으로 열려서
   * (submission.ts `stageWindows`) 이 축이 보는 「s5 창인가」는 달라지지 않는다.
   */
  stageNow: StageKey | null;
  /** 탈락에 미통과 판정이 달려 있는가. 없으면 마감 도달로 자동 처리된 것(h11) */
  gateFailed: boolean;
  /** 끝난 시즌에서 방금 무언가를 고치려 했는가 — h9와 h16을 가르는 유일한 축 */
  writeAttempt: boolean;
};

/**
 * 어느 판을 그리는가. 시안에 대응하는 판이 없으면 null이다.
 *
 * 순서가 뜻을 만든다 — **생존 상태가 진도보다 앞서고, 아카이브가 생존 상태보다
 * 앞선다.** 실격된 팀에게 「s4 레이스」를 보여주지 않기 위해서이고, 끝난 시즌
 * 에서는 탈락한 팀도 요약을 보기 때문이다(헤더의 D6·D7도 같은 순서다).
 */
export function resolveHubPane(input: HubInput): HubPane | null {
  const { phase, entry, onboardingComplete, measurementReady, stageNow } = input;

  /* 참가 기록이 없으면 `page.tsx`가 따로 그린다(h1 재사용 · h17) */
  if (!entry) return null;

  if (!isArchived(phase)) {
    if (entry.status === EntryStatus.disqualified) return "disqualified";
    if (entry.status === EntryStatus.eliminated) {
      return input.gateFailed ? "gateFail" : "missed";
    }
    /* 자진 포기는 시안에 판이 없다 */
    if (entry.status !== EntryStatus.active) return null;
  }

  if (isArchived(phase)) return input.writeAttempt ? "readonly" : "archived";
  if (isAwarded(phase)) return "awarded";

  /* 사전신청 구간은 시안에 대응하는 판이 없다 */
  if (isPreApply(phase)) return null;

  if (entry.stage === EntryStage.applied) {
    if (onboardingComplete) return "s1";
    /* 레이스가 이미 돌고 있는데 온보딩이 남았다 — 시안 h10 */
    return isRacing(phase) ? "late" : "onboarding";
  }

  switch (entry.stage) {
    case EntryStage.s1:
      return "s2";
    case EntryStage.s2:
      return "gate1";
    case EntryStage.s3:
      return "s3";
    case EntryStage.s4:
      /*
        미배포가 먼저다 — 연동이 없으면 집계가 0이라 레이스 화면에 볼 것이
        없고, 마지막 주차라도 먼저 할 일은 배포다.
      */
      if (!measurementReady) return "undeployed";
      /* 마지막 주차는 제출이 아니라 **확인**이다(시안 h15) */
      return stageNow === StageKey.s5 ? "s5" : "race";
    case EntryStage.s5:
      return "gate2";
    /*
      `completed`는 진도를 다 뺀 상태다. 시즌 페이즈가 아직 racing이면
      시안에 대응하는 판이 없다 — 발표(h8)는 awarded가 만든다.
    */
    case EntryStage.completed:
      return null;
    default:
      return null;
  }
}
