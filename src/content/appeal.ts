/*
  소명 화면의 문안 — 시안 ver4 `#scr-appeal`이 정본이다.
  화면(app/dashboard/appeal)이 이 값을 그대로 그린다.

  시안에 없는 자리(대상 없음·검토 중·접수 중·팀원 안내)는 내가 정함(2026-09-23,
  수연 확인 대기).
*/

export const APPEAL_HEAD = {
  title: "소명",
} as const;

/**
 * 제목 밑의 경고줄 — 시안 `.wbar.warn`. 아이콘이 없다.
 * 「(규칙 제6조)」는 붙임 공백 — 390에서 「제6조)」가 홀로 떨어졌다(내가 정함, 2026-09-23).
 */
export const APPEAL_WBAR =
  "실격과 제재 통지 후 5영업일 내 접수, 운영진은 접수 후 5영업일 내 근거 지표를 포함하여 회신 (규칙\u00a0제6조)";

export const APPEAL_FIELD = {
  target: "소명 대상",
  reason: "소명 사유",
  files: "증빙 첨부",
  /* 시안에 없다 — 고를 것이 없을 때 고르개에 한 줄 */
  noTarget: "소명할 대상이 없어요",
} as const;

/**
 * 소명 대상의 이름 — 시안 「실격 처분 (10.22 통지)」·「지표 제재 (-214 보정)」.
 * 제재 넷과 게이트 판정은 시안에 예문이 없어 같은 꼴로 지었다.
 */
export const APPEAL_TARGET = {
  sanction: {
    warning: "경고",
    week_invalidated: "주간 지표 무효",
    disqualified: "실격 처분",
    award_revoked: "시상 취소",
  } as Record<string, string>,
  flag: "지표 제재",
  judgment: { s2: "1차 심사 미통과", s5: "2차 심사 판정" } as Record<string, string>,
  notice: (md: string) => `(${md} 통지)`,
  adjusted: (n: number) => `(${n} 보정)`,
  week: (n: number) => `${n}주차`,
} as const;

/** 접수 기한·회신 기한 상자 — 시안 `.hb-sum` */
export const APPEAL_SUM = {
  deadline: "접수 기한",
  /** 「10.29 23:59 (통지 10.22, 5영업일)」 */
  deadlineText: (by: string, noticed: string, days: number) =>
    `${by} (통지 ${noticed}, ${days}영업일)`,
  /** 대상이 없을 때 — 회신 기한 줄과 같은 꼴로 규칙만 적는다 */
  deadlineBefore: (days: number) => `통지 후 ${days}영업일`,
  reply: "회신 기한",
  /** ① — 아직 접수 전 */
  replyBefore: (days: number) => `접수일부터 ${days}영업일`,
  /** ② — 「10.30 23:59 (접수 후 5영업일)」 */
  replyText: (by: string, days: number) => `${by} (접수 후 ${days}영업일)`,
  received: "접수",
  status: "상태",
} as const;

export const APPEAL_STATUS = {
  reviewing: "검토 중",
  done: "검토 완료",
} as const;

export const APPEAL_BUTTON = {
  submit: "소명 접수하기",
  pending: "접수 중…",
} as const;

export const APPEAL_REPLY = {
  title: "운영진 회신",
} as const;

export const APPEAL_MESSAGE = {
  noTarget: "무엇에 대한 소명인지 골라 주세요.",
  leaderOnly: "소명은 팀장이 접수해요. 진행 상황은 팀원도 볼 수 있어요.",
  sessionLost: "로그인이 풀렸어요. 다시 로그인해 주세요.",
  noEntry: "참가 기록이 없어요.",
  badFiles: "증빙 파일이 이 팀의 것이 아니에요. 다시 올려 주세요.",
} as const;
