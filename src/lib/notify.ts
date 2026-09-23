/*
  공지의 **순수** 절반. 클라이언트 컴포넌트가 읽는다.

  ⚠️ notify-store.ts에 두면 안 된다 — 그쪽은 prisma를 import하고, 클라이언트가
  그걸 따라 끌고 오면 `node:module`이 브라우저 번들에 딸려가 화면이 통째로 깨진다.
  이 레포에서 세 번째다(profile / access-policy / admin). CLAUDE.md §8이 그 규칙이다.
*/

/**
 * 공지 대상 — 시안 필터 「stage, 전체 / s1~s3 / s4」 + 「track, 전체 / 트랙 이름」.
 *
 * 「전체」는 그 시즌의 **모든 참가팀**이다(탈락·실격 포함 — 결과 발표·일정 변경은
 * 그들도 받아야 한다). 스테이지를 고르면 **진행 중인 팀**만 — 「s4 주간 제출 마감」은
 * 탈락한 팀에게 갈 말이 아니다(내가 정함, 수연 확인 대기).
 */
export type StageTarget = "all" | "s1_s3" | "s4" | "s5";

export const STAGE_TARGET_LABEL: Record<StageTarget, string> = {
  all: "stage, 전체",
  s1_s3: "stage, s1~s3",
  s4: "stage, s4",
  s5: "stage, s5",
};

/**
 * 참가 기록의 진도가 그 대상에 드는가. `entries.stage`는 **지금 하고 있는 스테이지**다
 * (applied는 s1 준비 중, 게이트를 통과하면 판정이 다음 칸으로 올린다).
 */
export function inStageTarget(target: StageTarget, stage: string, active: boolean): boolean {
  if (target === "all") return true;
  if (!active) return false;
  if (target === "s1_s3") return ["applied", "s1", "s2", "s3"].includes(stage);
  return stage === target;
}

/** 채널 표기 — 시안 이력 표 「인앱, 메일」 */
export function channelLabel(channels: { inapp: boolean; mail: boolean }): string {
  return [channels.inapp ? "인앱" : null, channels.mail ? "메일" : null].filter(Boolean).join(", ");
}
