/*
  알림센터의 문안 — 시안 ver4 `#scr-noti`가 정본이다.
  화면(app/notifications)이 이 값을 그대로 그린다.
*/

export const NOTI_HEAD = {
  title: "알림센터",
  sub: "심사, 마감, 공지를 여기서 모아 봐요.",
  readAll: "전체 읽음",
} as const;

/**
 * 가입하면 받는 첫 알림 — 시안 ② nt-empty가 「막 가입한 사람」의 알림센터다.
 * 가입 어댑터(`auth-adapter.ts` createUser)가 사용자와 같이 만든다.
 */
export const NOTI_WELCOME = {
  type: "welcome",
  title: "환영해요 👋",
  body: "온보딩 체크리스트에서 시작해요, 팀 구성 → 측정 연동 순서예요.",
  linkUrl: "/dashboard",
} as const;
