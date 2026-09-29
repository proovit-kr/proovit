import { createHash, randomInt } from "node:crypto";

import { z } from "@/lib/z";

/*
  계정 이메일 변경 — 새 주소로 보낸 6자리 코드를 입력해야 바뀐다.

  코드 없이 바꾸게 하면 남의 주소를 적어 그 사람에게 심사 결과 메일이 가고,
  그 주소 주인이 나중에 같은 주소의 소셜 계정으로 가입하려 할 때 막힌다
  (Auth.js는 같은 이메일의 기존 회원에 소셜 계정을 자동으로 잇지 않는다).

  저장은 `verification_tokens`를 빌린다 — 소셜 로그인만 써서 비어 있는 표다.
  identifier가 `email-change:<userId>:<새 주소>`, 틀린 입력은
  `email-change-miss:<userId>` 행으로 센다. 스키마를 늘리지 않는다(내가 정함).
*/

export const CODE_TTL_MIN = 10;
/** 같은 사람이 코드를 다시 받으려면 기다리는 시간 */
export const RESEND_WAIT_SEC = 60;
/** 한 코드에 틀릴 수 있는 횟수. 넘으면 새 코드를 받아야 한다 */
export const MAX_MISSES = 5;
const EMAIL_MAX = 200;

export const PREFIX = "email-change:";
export const MISS_PREFIX = "email-change-miss:";

export type EmailChangeFailure =
  | "INVALID"
  | "SAME"
  | "TAKEN"
  | "TOO_SOON"
  | "NO_CODE"
  | "WRONG_CODE"
  | "LOCKED";

export const EMAIL_CHANGE_MESSAGE: Record<EmailChangeFailure, string> = {
  INVALID: "이메일 형식이 아니에요.",
  SAME: "지금 쓰는 주소와 같아요.",
  TAKEN: "다른 계정이 쓰고 있는 주소예요.",
  TOO_SOON: "코드를 방금 보냈어요. 잠시 뒤에 다시 받아 주세요.",
  NO_CODE: "코드가 만료됐어요. 다시 받아 주세요.",
  WRONG_CODE: "코드가 맞지 않아요.",
  LOCKED: "여러 번 틀려 이 코드는 더 쓸 수 없어요. 새 코드를 받아 주세요.",
};

/** 앞뒤 공백을 떼고 소문자로 — 컬럼이 citext라 대소문자는 같은 주소다 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function checkNewEmail(raw: string, current: string): EmailChangeFailure | null {
  const value = normalizeEmail(raw);
  if (value.length === 0 || value.length > EMAIL_MAX) return "INVALID";
  if (!z.email().safeParse(value).success) return "INVALID";
  if (value === normalizeEmail(current)) return "SAME";
  return null;
}

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * 표에 넣는 값. token 열이 표 전체에서 unique라 사용자를 섞는다. 코드는 해시로만
 * 남긴다 — 표를 읽을 수 있는 사람이 코드를 그대로 보지 않게.
 */
export function codeHash(userId: string, code: string): string {
  return createHash("sha256").update(`${PREFIX}${userId}:${code}`).digest("hex");
}

/** 사람이 친 코드에서 숫자만 — 「123 456」, 「123-456」도 받는다 */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, "");
}
