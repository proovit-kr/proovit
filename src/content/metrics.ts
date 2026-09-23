/*
  내 지표 화면의 문안 — 시안 ver4 `#scr-mymetrics`가 정본이다.
  화면(app/dashboard/metrics)이 이 값을 그대로 그린다.
*/

export const METRICS_HEAD = {
  title: "내 지표",
  sub: "팀 주소를 거친 트래픽이 매일 자동으로 쌓여요.",
} as const;

/** 카드 셋 — 시안 `.hb-cards` */
export const METRICS_CARD = {
  visitors: "주간 방문",
  signups: "주간 가입",
  conversion: "전환율",
} as const;

/** 2선 차트 — 시안 `.ch` */
export const METRICS_CHART = {
  title: "최근 14일",
  visitors: "방문",
  signups: "가입 (별도 스케일)",
} as const;

export const METRICS_CHANNELS = {
  title: "유입 채널 상위 3",
} as const;

/** ② 빈 상태 — 시안 `.lb-empty` */
export const METRICS_EMPTY = {
  badge: "측정 연동 확인됨 ✓",
  big: "아직 방문이 없습니다",
  body: "연동은 확인됐어요. 첫 방문자가 오면 여기부터 채워져요, 홍보 링크를 뿌려 볼까요?",
  button: "홍보 링크 복사",
} as const;

/**
 * 측정 연동이 아직 안 끝난 팀의 빈 상태. 시안에 없다 — ②의 「연동은
 * 확인됐어요」를 그대로 보이면 거짓이라 최소로 갈랐다(내가 정함, 2026-09-23,
 * 수연 확인 대기).
 */
export const METRICS_UNVERIFIED = {
  badge: "측정 연동 확인 전",
  body: "측정 연동을 먼저 끝내 주세요. 확인되면 첫 방문자부터 여기에 쌓여요.",
  button: "측정 연동으로",
} as const;

export const METRICS_TOAST = {
  copied: "홍보 링크를 복사했어요.",
  copyFailed: "복사하지 못했어요. 주소를 직접 골라 복사해 주세요.",
} as const;
