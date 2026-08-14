import { EntryStage, JudgmentResult, StageKey } from "@/generated/prisma/enums";

/*
  심사의 **순수** 절반 — 판정이 무엇을 바꾸는가. 화면(클라이언트)도 읽는다.

  근거는 규칙 제9조 ③(통과·보류·미통과로 통지, 미통과 시 사유 요지 포함)과
  8/14 스크럼에서 동혁이 확인해 준 전진 규칙("팀별로 게이트 통과하면 스테이지 값
  올라갑니다")이다.
*/

/** 보완 재제출 기한 — 스키마 주석의 「원 마감 +48시간」 */
export const REVISION_HOURS = 48;

/** 판정 사유(피드백) 최소 길이. 미통과·보완은 사유 요지가 규칙상 필수다 */
export const FEEDBACK_MIN = 10;

/**
 * 게이트를 통과하면 진도가 어디로 가는가.
 *
 * s2를 통과하면 s3, s5를 통과하면 completed다. **판정이 진도를 올리는 유일한
 * 자리**이고, 이 표가 곧 「전진 자체가 통과의 근거」(스키마 EntryStage 주석)의 구현이다.
 */
export const PASS_ADVANCES_TO: Partial<Record<StageKey, EntryStage>> = {
  [StageKey.s2]: EntryStage.s3,
  [StageKey.s5]: EntryStage.completed,
};

/**
 * 판정 결과가 참가 상태에 미치는 영향.
 *
 * ⚠️ 미통과는 **탈락(eliminated)**이지 실격(disqualified)이 아니다. 규칙 제9조 ④가
 * "1차 미통과는 제재가 아니며 테스터·평가자로 전환된다"고 못박았다 — 실격으로
 * 적으면 그 팀에게 규칙에 없는 낙인을 찍는 것이고, 소명 절차도 달라진다.
 */
export const FAIL_MEANS_ELIMINATED = true;

export const RESULT_LABEL: Record<string, string> = {
  [JudgmentResult.pass]: "통과",
  [JudgmentResult.revision]: "보완 요청",
  [JudgmentResult.fail]: "미통과",
};

export const RESULT_EFFECT: Record<string, string> = {
  [JudgmentResult.pass]: "진도가 다음 단계로 넘어갑니다.",
  [JudgmentResult.revision]:
    `재제출 기한이 ${REVISION_HOURS}시간 열립니다. 진도와 상태는 그대로입니다.`,
  [JudgmentResult.fail]:
    "탈락 처리되고 리더보드에서 빠집니다. 실격이 아니라 테스터·평가자로 전환됩니다(제9조 ④).",
};

export type JudgingFailureCode =
  | "NOT_FOUND"
  | "ALREADY_JUDGED"
  | "FEEDBACK_TOO_SHORT"
  | "NOT_SUBMITTED";

export const JUDGING_FAILURE_MESSAGE: Record<JudgingFailureCode, string> = {
  NOT_FOUND: "제출을 찾을 수 없습니다.",
  ALREADY_JUDGED: "이미 판정한 제출입니다. 정정은 이의신청 절차로 합니다.",
  FEEDBACK_TOO_SHORT: `사유를 ${FEEDBACK_MIN}자 이상 적어 주세요. 미통과·보완은 사유 요지를 함께 통지해야 합니다(제9조 ③).`,
  NOT_SUBMITTED: "아직 제출되지 않았습니다. 임시 저장 상태는 판정할 수 없습니다.",
};
