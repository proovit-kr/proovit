import {
  EntryStage,
  EntryStatus,
  InvitationStatus,
  type SeasonPhase,
} from "@/generated/prisma/enums";
import { isRacing, isRecruiting } from "@/lib/season-phase";
import { z } from "@/lib/z";

/*
  팀 관리의 **순수** 절반. DB도 세션도 모른다 — 화면(클라이언트)도 이 파일을 읽는다.
  쓰기는 team-store.ts에 있다. apply.ts / apply-store.ts를 가른 것과 같은 형태다.

  ⚠️ 그래서 enum은 `@/generated/prisma/enums`에서, 페이즈 술어는 season-phase.ts에서
  가져온다. `@/generated/prisma/client`나 access-policy.ts를 끌어오면 클라이언트
  번들에 DB 클라이언트가 딸려 간다(access-policy.ts 머리 주석).
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
 *
 * 만료를 합류 마감(`joinClosedCode`)에 맞출 필요는 없다 — 수락할 때 마감을 따로 본다.
 */
export const INVITE_TTL_DAYS = 7;

/*
  초대 코드 — 시안 `PRV-LP-7F3K`. 접두사 PRV + 무작위 2자 + 무작위 4자.

  ⚠️ 사람이 눈으로 읽고 손으로 옮겨 적는 값이라 헷갈리는 글자를 뺀다 —
  0/O, 1/I/L, 8/B. 카톡으로 코드를 불러주는 흐름이 실제로 생긴다.

  DB에는 하이픈 없이 `PRVLP7F3K`(9자)로 둔다(VARCHAR(12)). 하이픈은 보여줄 때
  `formatInviteCode`가 붙이고, 받을 때는 `normalizeInviteCode`가 뗀다.

  무작위 부분이 6자라 경우의 수는 27^6 ≈ 3.9억이다(전에는 8자, 2.8천억).
  코드는 팀 하나에 1회용이고 7일이면 죽지만, 가입 시도에 횟수 제한이 없으면
  뚫리는 크기이긴 하다 — /apply의 코드 확인에 제한을 걸 때 이 숫자를 기준으로.
*/
export const INVITE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY2345679";
export const INVITE_CODE_PREFIX = "PRV";
/** 접두사 뒤 무작위 부분의 길이 */
export const INVITE_CODE_LENGTH = 6;
/** 보여줄 때 무작위 부분을 이렇게 끊는다 — `LP-7F3K` */
const INVITE_CODE_GROUPS = [2, 4] as const;

/**
 * 사람이 대소문자·공백·하이픈을 섞어 넣어도 같은 코드로 읽는다.
 * 접두사를 빼고 `LP-7F3K`만 넣어도 받는다.
 */
export function normalizeInviteCode(raw: string): string {
  const bare = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  return bare.length === INVITE_CODE_LENGTH && !bare.startsWith(INVITE_CODE_PREFIX)
    ? INVITE_CODE_PREFIX + bare
    : bare;
}

/** 저장된 코드를 사람이 읽는 모양으로 — `PRVLP7F3K` → `PRV-LP-7F3K` */
export function formatInviteCode(code: string): string {
  const body = code.startsWith(INVITE_CODE_PREFIX)
    ? code.slice(INVITE_CODE_PREFIX.length)
    : code;
  const parts: string[] = [INVITE_CODE_PREFIX];
  let at = 0;
  for (const size of INVITE_CODE_GROUPS) {
    parts.push(body.slice(at, at + size));
    at += size;
  }
  if (at < body.length) parts.push(body.slice(at));
  return parts.filter(Boolean).join("-");
}

export const InviteCodeSchema = z
  .string()
  .trim()
  .min(1, "초대 코드를 입력해 주세요.")
  .transform(normalizeInviteCode)
  .refine((code) => {
    if (!code.startsWith(INVITE_CODE_PREFIX)) return false;
    const body = code.slice(INVITE_CODE_PREFIX.length);
    return (
      body.length === INVITE_CODE_LENGTH &&
      [...body].every((ch) => INVITE_ALPHABET.includes(ch))
    );
  }, "초대 코드 형식이 아닙니다. 받은 코드를 다시 확인해 주세요.");

/** 초대 링크. 초대받은 사람은 참가 기록이 없어 대시보드로 못 들어온다 */
export function inviteUrl(code: string, origin?: string): string {
  const path = `/apply?invite=${encodeURIComponent(code)}`;
  return origin ? `${origin}${path}` : path;
}

// ═════════════════════════════════════════════════════════════
// 합류 기간 — 팀원이 언제까지 들어올 수 있나
// ═════════════════════════════════════════════════════════════

/*
  ✅ **2026-09-25 수연 지시: 「지각 참가도 허용한다고 했으니까 s1까지 초대 수락되도록
  수정해」.** 근거는 PRD FR-B3 「초대 수락은 recruiting~s1에만 허용」(P0)과
  OPEN-6 지각 참가 허용이다. 그 전에는 모집 페이즈에만 받았다.

  「s1까지」를 **팀의 진도**로 읽는다. 시각(`stages.closes_at`)으로 읽지 않는 이유는
  유동 게이트다 — 팀마다 s1을 내는 날이 다르다. 그래서 마감을 놓쳐 사실상 끝난
  active 팀도 s2를 안 냈으면 계속 받는다(붙어도 그 팀이 더 나아가지는 못한다).
  내가 정함(수연 확인 대기, 2026-09-25).

  ⚠️ `entry.stage`는 **마지막으로 낸 단계**다(access-policy.ts `SUBMIT_PREREQUISITE`).
  applied는 s1을 아직 안 냈다, s1은 s1을 냈고 s2는 아직이다. 둘 다 받으므로
  **실제로 닫히는 때는 s2를 낸 순간**이다. 문구도 그렇게 적는다(JOIN_CLOSED).
  「s1을 내기 전까지」로 좁히려면 아래에서 s1 한 줄을 뺀다 — 내가 정함(수연 확인 대기).
*/
const JOIN_STAGES: readonly EntryStage[] = [EntryStage.applied, EntryStage.s1];

/**
 * 합류(초대 수락)를 받는 페이즈인가 — 모집과 레이스.
 *
 * ⚠️ **새 참가 신청과 다르다.** 신청은 여전히 모집 구간에만 받는다
 * (apply-store `submitApply`·/apply 화면의 `resolveLandingCta`). 합류는 이미 있는
 * 참가에 사람을 붙이는 일이라 레이스 중에도 열고, 팀별 진도는 `joinClosedCode`가 본다.
 */
export function isJoinPhase(phase: SeasonPhase): boolean {
  return isRecruiting(phase) || isRacing(phase);
}

/**
 * 합류를 막는 사유. `TEAM_FAILURE_MESSAGE`로 그대로 안내한다.
 *
 * 페이즈로 닫힌 것(JOIN_PHASE_CLOSED)과 진도로 닫힌 것(JOIN_CLOSED)을 가른다 —
 * 하나로 두면 시상 중 팀 관리 화면이 s2를 안 낸 팀에게 「s2 제출 전까지」를 말한다.
 */
export type JoinClosedCode = "JOIN_PHASE_CLOSED" | "JOIN_CLOSED" | "TEAM_INACTIVE";

/**
 * 이 팀에 지금 팀원이 합류할 수 있는가. 열려 있으면 null, 닫혀 있으면 사유.
 *
 * `entry`는 **초대가 가리키는 팀의 이번 시즌 참가**다(합류하는 사람의 것이 아니다).
 * 합류·초대 화면(`inviteFailure`를 거쳐)과 초대 발급·재발송(팀 관리 액션)이
 * 전부 이 함수 하나를 부른다 — 발급해 봐야 받을 수 없는 초대를 메일로 보내지 않게.
 *
 * 순서: 페이즈 → 생존 상태 → 진도.
 *   · 모집·레이스가 아니면 닫힌다(사전신청·시상·아카이브·draft).
 *   · 탈락·실격·포기한 팀에는 안 붙인다 — **모집 중에도 그렇다.** 운영자가 모집
 *     중에 실격시킨 팀에 사람이 붙는 길을 남기지 않는다. 내가 정함(수연 확인 대기).
 *   · 진도는 **모집 중에도 똑같이 본다.** 제출은 페이즈로 잠기지 않아
 *     (`stages.opens_at`이 비면 열린다 · submission-store) 모집 중에 s2를 낸 팀이
 *     있을 수 있다. 모집 중에만 풀어 두면 그 팀의 대기 초대가 레이스로 넘어가는
 *     순간 소리 없이 죽는다. PRD 「recruiting~s1」을 「모집 중엔 전부」로 읽지
 *     않은 것이다 — 내가 정함(수연 확인 대기, 2026-09-25).
 */
export function joinClosedCode(
  phase: SeasonPhase,
  entry: { stage: EntryStage; status: EntryStatus },
): JoinClosedCode | null {
  if (!isJoinPhase(phase)) return "JOIN_PHASE_CLOSED";
  if (entry.status !== EntryStatus.active) return "TEAM_INACTIVE";
  return JOIN_STAGES.includes(entry.stage) ? null : "JOIN_CLOSED";
}

/** 초대 하나로 합류할 수 있는지 가르는 재료. DB에서 읽은 값을 그대로 넣는다 */
export type InviteCheck = {
  status: InvitationStatus;
  expiresAt: Date;
  /** 초대가 가리키는 팀의 지금 인원 */
  memberCount: number;
  /** 그 팀의 이번 시즌 참가. 없으면 붙을 참가가 없다 */
  entry: { stage: EntryStage; status: EntryStatus } | null;
  /** 합류하려는 사람이 이미 그 팀에 있는가. 사람을 모르는 조회(findInvite)는 false */
  alreadyMember: boolean;
};

export type InviteFailureCode =
  | "INVITE_NOT_FOUND"
  | "INVITE_USED"
  | JoinClosedCode
  | "INVITE_EXPIRED"
  | "ALREADY_MEMBER"
  | "TEAM_FULL";

/**
 * 이 초대로 지금 합류할 수 없는 사유. 되면 null.
 *
 * 조회 화면(`findInvite`)과 수락(`acceptInvite`)이 **이 함수 하나를** 부른다 —
 * 화면이 말한 사유와 제출 뒤의 사유가 달라지지 않게. 순서는 team.test.ts가 고정한다.
 *
 * 순서: 없음 → 사용됨 → 참가 없음 → 합류 마감 → 만료 → 이미 팀원 → 정원.
 *   · 합류 마감을 만료보다 먼저 본다. 만료 문구는 「팀장에게 새 코드를 요청」하라고
 *     하는데, 마감된 팀의 팀장은 새 코드를 발급할 수 없다(팀 관리 액션이 막는다).
 *     내가 정함(수연 확인 대기, 2026-09-25).
 */
export function inviteFailure(
  invite: InviteCheck | null,
  phase: SeasonPhase,
  now: Date,
): InviteFailureCode | null {
  if (!invite) return "INVITE_NOT_FOUND";
  if (invite.status !== InvitationStatus.pending) return "INVITE_USED";
  /* 이번 시즌에 참가하지 않은 팀의 초대 — 붙을 참가가 없다 */
  if (!invite.entry) return "INVITE_NOT_FOUND";
  const closed = joinClosedCode(phase, invite.entry);
  if (closed) return closed;
  if (invite.expiresAt <= now) return "INVITE_EXPIRED";
  if (invite.alreadyMember) return "ALREADY_MEMBER";
  if (invite.memberCount >= MAX_TEAM_SIZE) return "TEAM_FULL";
  return null;
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
  | "LAST_MEMBER"
  | JoinClosedCode;

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
  /*
    「s1 제출까지」가 아니다 — s1을 낸 팀도 s2를 내기 전까지는 받는다(JOIN_STAGES).
    초대받는 쪽과 팀장 쪽이 같은 문구를 읽으므로 주어를 팀원으로 둔다.
  */
  JOIN_CLOSED: "팀원은 s2 제출 전까지만 합류할 수 있어요.",
  /* 모집·레이스 밖(시상·아카이브 등). 진도 탓이 아니라서 s2를 말하지 않는다 */
  JOIN_PHASE_CLOSED: "지금은 팀원을 받지 않아요.",
  /* 탈락·실격·포기 — 팀의 사정을 초대받는 사람에게 풀어 말하지 않는다 */
  TEAM_INACTIVE: "지금은 이 팀에 합류할 수 없어요.",
};

/*
  레이스 중 살아 있는 초대 밑에 붙이는 안내(팀 관리 화면). 초대 메일의 기한은 7일인데
  팀장이 s2를 내면 그보다 먼저 닫힌다 — 말하지 않으면 초대가 경고 없이 죽는다.
  모집 중에는 붙이지 않는다(시안 ②의 초대 대기 상자에 힌트가 없다).
  내가 정함(수연 확인 대기, 2026-09-25).
*/
export const JOIN_DEADLINE_NOTE = "s2를 내면 이 초대로는 합류할 수 없어요.";
