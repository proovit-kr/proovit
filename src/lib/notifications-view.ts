/*
  알림센터의 판정 — 순수 계산만. 화면은 app/notifications.

  시안 `#scr-noti`의 행은 유형 점 셋(`.nt.t-judge`·`.t-due`·`.t-info`)으로
  갈린다. 스키마의 `notifications.type`은 코드 상수라(스키마 주석) 여기서
  세 갈래로 접는다 — 모르는 값은 안내다.
*/

import { fmtMD } from "@/lib/header-state";

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
 * 버린다(행이 곧 그리로 가는 링크라 바깥 주소면 피싱 통로가 된다).
 */
export function notiHref(linkUrl: string | null): string | null {
  if (!linkUrl) return null;
  if (!linkUrl.startsWith("/") || linkUrl.startsWith("//") || linkUrl.startsWith("/\\")) {
    return null;
  }
  return linkUrl;
}

/** 이보다 가까우면 날짜 대신 「방금」 — 시안 ② 막 가입한 사람의 환영 알림 */
const JUST_NOW_MS = 60 * 60_000;

/** 「방금」 또는 「10.12」 (내가 정함: 한 시간 안이면 방금, 수연 확인 대기) */
export function notiTime(at: Date, now: Date): string {
  return now.getTime() - at.getTime() < JUST_NOW_MS ? "방금" : fmtMD(at);
}

/**
 * 판 이름. 환영 알림밖에 없으면 ② 빈 상태다 — 시안의 「빈 상태」는 알림이 0개가
 * 아니라 가입하며 받은 환영 한 줄만 있는 화면이다.
 */
export function notiState(types: readonly string[]): "list" | "empty" {
  return types.every((t) => t === "welcome") ? "empty" : "list";
}
