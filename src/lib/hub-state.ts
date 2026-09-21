/*
  대시보드 허브가 **어느 화면인가**를 정하는 곳.

  시안 `#scr-hub`의 `<select id="hubSel">`가 17종을 나열하는데, 그중
  「정상 흐름」 아홉(h1~h9)이 이 파일이 내는 값이다. 「예외」 여덟(h10~h17)은
  아직 옮기지 않았다 — 그 상태에서는 `null`이 나가고 화면이 옛 안내를 그린다.

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
  type SeasonPhase,
} from "@/generated/prisma/client";
import { isArchived, isAwarded, isPreApply } from "@/lib/season-phase";

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
  | "archived";

export type HubInput = {
  phase: SeasonPhase;
  entry: { stage: EntryStage; status: EntryStatus } | null;
  onboardingComplete: boolean;
};

/**
 * 어느 판을 그리는가. 「정상 흐름」이 아니면 null이다.
 *
 * 순서가 뜻을 만든다 — **생존 상태가 진도보다 앞서고, 시즌의 끝이 진도보다
 * 앞선다.** 실격된 팀에게 「s4 레이스」를, 끝난 시즌에 「이번 주 제출」을
 * 보여주지 않기 위해서다.
 */
export function resolveHubPane(input: HubInput): HubPane | null {
  const { phase, entry, onboardingComplete } = input;

  /* 참가 기록이 없으면 허브에 올 일이 없다(page가 404를 낸다). 방어다 */
  if (!entry) return null;

  /*
    탈락·실격·자진포기는 시안 h11·h12·h14가 맡는다. 아직 안 옮겼으므로
    여기서 정상 흐름으로 떨어뜨리지 않는다 — 떨어뜨리면 실격된 팀이
    레이스 화면을 본다.
  */
  if (entry.status !== EntryStatus.active) return null;

  if (isArchived(phase)) return "archived";
  if (isAwarded(phase)) return "awarded";

  /* 사전신청 구간은 시안에 대응하는 정상 흐름 판이 없다 */
  if (isPreApply(phase)) return null;

  if (entry.stage === EntryStage.applied) {
    return onboardingComplete ? "s1" : "onboarding";
  }

  switch (entry.stage) {
    case EntryStage.s1:
      return "s2";
    case EntryStage.s2:
      return "gate1";
    case EntryStage.s3:
      return "s3";
    case EntryStage.s4:
      return "race";
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
