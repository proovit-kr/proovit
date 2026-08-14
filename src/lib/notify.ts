/*
  공지의 **순수** 절반. 클라이언트 컴포넌트가 읽는다.

  ⚠️ notify-store.ts에 두면 안 된다 — 그쪽은 prisma를 import하고, 클라이언트가
  그걸 따라 끌고 오면 `node:module`이 브라우저 번들에 딸려가 화면이 통째로 깨진다.
  이 레포에서 세 번째다(profile / access-policy / admin). CLAUDE.md §8이 그 규칙이다.
*/

/** 공지를 누구에게 보내는가 */
export type Audience = "all" | "active";

export const AUDIENCE_LABEL: Record<Audience, string> = {
  all: "모든 참가팀",
  active: "진행 중인 팀만",
};
