/*
  알림센터의 판정 — 순수 계산만. 화면은 app/notifications.

  시안 `#scr-noti`의 행은 유형 점 셋(`.nt.t-judge`·`.t-due`·`.t-info`)으로
  갈린다. 스키마의 `notifications.type`은 코드 상수라(스키마 주석) 여기서
  세 갈래로 접는다 — 모르는 값은 안내다.
*/

export type NotiTone = "judge" | "due" | "info";

/** 심사·제출·소명 — 보라 점 */
const JUDGE = new Set(["gate_result", "judgment", "submission", "appeal"]);
/** 마감 — 경고색 점 */
const DUE = new Set(["deadline"]);

export function notiTone(type: string): NotiTone {
  if (JUDGE.has(type)) return "judge";
  if (DUE.has(type)) return "due";
  return "info";
}

/**
 * 행을 눌렀을 때 갈 곳. 우리 화면 안의 경로만 받는다 — `//host`나 절대 URL은
 * 버린다(읽음 처리 뒤 이 값으로 리다이렉트하므로 열린 리다이렉트가 된다).
 */
export function notiHref(linkUrl: string | null): string | null {
  if (!linkUrl) return null;
  if (!linkUrl.startsWith("/") || linkUrl.startsWith("//") || linkUrl.startsWith("/\\")) {
    return null;
  }
  return linkUrl;
}
