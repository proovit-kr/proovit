import { z } from "@/lib/z";

/*
  팀 관리의 **순수** 절반. DB도 세션도 모른다 — 화면(클라이언트)도 이 파일을 읽는다.
  쓰기는 team-store.ts에 있다. apply.ts / apply-store.ts를 가른 것과 같은 형태다.
*/

/**
 * 한 팀의 최대 인원.
 *
 * 근거는 CLAUDE.md 「1~2인 팀이 AI로 웹서비스를 만든다」와 랜딩 카피다.
 * 운영규칙서에 숫자로 박힌 조항은 아직 없어서, **여기 상수 하나가 정본이다** —
 * 화면·초대·검증이 전부 이 값을 읽는다. 3인을 허용하기로 하면 이 줄만 고친다.
 */
export const MAX_TEAM_SIZE = 2;

/**
 * 초대 유효기간(일).
 *
 * ⚠️ 문서 근거가 없다. 시즌이 5주인데 모집 구간이 그보다 짧아 7일로 잡았다 —
 * 만료가 없으면 취소를 잊은 초대 코드가 시즌 내내 살아 있고, 팀에서 나간 사람이
 * 그 코드로 다시 들어올 수 있다. 8/17에 확인할 것.
 */
export const INVITE_TTL_DAYS = 7;

/*
  초대 코드 문자표.

  ⚠️ 사람이 눈으로 읽고 손으로 옮겨 적는 값이라 헷갈리는 글자를 뺀다 —
  0/O, 1/I/L, 8/B. 카톡으로 코드를 불러주는 흐름이 실제로 생긴다.
  스키마가 VARCHAR(12)라 8자로 두어 여유를 남긴다.
*/
export const INVITE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY2345679";
export const INVITE_CODE_LENGTH = 8;

/** 사람이 대소문자·공백·하이픈을 섞어 넣어도 같은 코드로 읽는다 */
export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

export const InviteCodeSchema = z
  .string()
  .trim()
  .min(1, "초대 코드를 입력해 주세요.")
  .transform(normalizeInviteCode)
  .refine(
    (code) =>
      code.length === INVITE_CODE_LENGTH &&
      [...code].every((ch) => INVITE_ALPHABET.includes(ch)),
    "초대 코드 형식이 아닙니다. 받은 코드를 다시 확인해 주세요.",
  );

/**
 * 초대에 적어두는 이메일. **선택값이다.**
 *
 * 넣으면 그 사람에게 안내 메일을 보내고, 비우면 코드만 발급해 팀장이 직접 전한다.
 * 메일 발송(Resend)이 아직 안 붙어 있어 지금은 어느 쪽이든 코드를 직접 전한다.
 */
export const InviteEmailSchema = z
  .string()
  .trim()
  .max(200)
  .email("이메일 형식이 아닙니다.")
  .optional()
  .or(z.literal("").transform(() => undefined));

/** 초대 링크. 초대받은 사람은 참가 기록이 없어 대시보드로 못 들어온다 */
export function inviteUrl(code: string, origin?: string): string {
  const path = `/apply?invite=${encodeURIComponent(code)}`;
  return origin ? `${origin}${path}` : path;
}

/** 화면이 구분해서 안내해야 하는 실패들 */
export type TeamFailureCode =
  | "TEAM_FULL"
  | "INVITE_EXISTS"
  | "INVITE_NOT_FOUND"
  | "INVITE_EXPIRED"
  | "INVITE_USED"
  | "ALREADY_MEMBER"
  | "ALREADY_APPLIED"
  | "NOT_MEMBER"
  | "LAST_MEMBER";

export const TEAM_FAILURE_MESSAGE: Record<TeamFailureCode, string> = {
  TEAM_FULL: `팀은 최대 ${MAX_TEAM_SIZE}명까지예요.`,
  INVITE_EXISTS: "이미 발급된 초대가 있어요. 취소한 뒤 다시 발급해 주세요.",
  INVITE_NOT_FOUND: "그런 초대 코드가 없어요.",
  INVITE_EXPIRED: "만료된 초대 코드예요. 팀장에게 새 코드를 요청해 주세요.",
  INVITE_USED: "이미 사용되거나 취소된 초대 코드예요.",
  ALREADY_MEMBER: "이미 이 팀의 팀원이에요.",
  ALREADY_APPLIED: "이미 참가 신청한 팀이 있어요.",
  NOT_MEMBER: "그 사람은 이 팀의 팀원이 아니에요.",
  LAST_MEMBER: "혼자인 팀에서는 나갈 수 없어요.",
};
