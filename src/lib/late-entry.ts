import type { SeasonPhase } from "@/generated/prisma/enums";
import { isRacing, isRecruiting } from "@/lib/season-phase";
import { INVITE_ALPHABET } from "@/lib/team";

/*
  지각 편입의 **순수** 절반 — 링크로 지금 신청할 수 있는가, 운영자가 지금 링크를
  만들 수 있는가. DB도 세션도 모른다. 읽기·쓰기는 late-entry-store.ts와 admin-store.ts다.

  근거(2026-09-26 수연 지시 「문의가 오면 운영자가 수동 편입하는 화면과 로직」):
    PRD OPEN-6  지각 참가 허용. 별도 「지각」 상태·자동 마감 연장 없이, 문의가 오면
                운영자가 수동으로 시즌에 편입한다
    FR-D5       지각 참가(s1×applied) 허용, 1차 마감은 동일, 경고 배너
    PLN3 3.2    racing(s1 구간) × applied — 온보딩 허용, s1 마감 동일 → 경고 배너
  경고 배너와 지각 판(허브 h10)은 이미 있다(hub-state.ts). 여기는 「들여보내는 문」만 둔다.

  방식 — 운영자가 **1회용 편입 링크**를 만들고, 참가자가 그 링크로 평소 신청서(시안 ①)를
  직접 써서 동의까지 한다. 운영자가 참가 행을 대신 만들면 본인 동의를 받을 자리가
  없다(schema.prisma LateEntryPass 주석). 내가 정함(수연 확인 대기).
*/

// ═════════════════════════════════════════════════════════════
// 코드와 링크
// ═════════════════════════════════════════════════════════════

/*
  편입 코드 — 초대 코드와 **같은 문자표·같은 생성기**(team-store `generateCode`)에
  접두사만 다르다. 섞이지 않게 하는 것이 목적이다: 초대 코드는 PRV로 시작하고
  `normalizeInviteCode`가 6자 몸통에 PRV를 붙이므로, LTE로 시작하는 11자는 어떤
  경로로도 초대 코드로 읽히지 않는다. 운영자도 한눈에 가른다.

  몸통이 초대 코드(6자)보다 긴 8자인 이유: 이 값은 사람이 옮겨 적지 않고 링크로만
  오간다. 길어도 불편이 없고, /apply는 횟수 제한 없이 코드를 받는다(team.ts 초대
  코드 주석의 걱정과 같다). 27^8 ≈ 2.8천억. 11자라 VarChar(12)에 든다.
*/
export const LATE_PASS_PREFIX = "LTE";
export const LATE_PASS_LENGTH = 8;

/**
 * 링크 유효기간(일). 초대(`INVITE_TTL_DAYS`)와 같은 7일 — 문의에 답한 뒤 참가자가
 * 신청서를 쓰기까지의 여유다. 실제 기한은 s1 달력 마감과 견줘 이른 쪽이다(`latePassExpiry`).
 * 내가 정함(수연 확인 대기).
 */
export const LATE_PASS_TTL_DAYS = 7;

/** 링크의 `?late=` 값을 저장된 모양으로 — 대소문자·공백·하이픈을 뗀다 */
export function normalizeLatePassCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

/** 편입 코드 모양인가. 아니면 DB를 볼 것도 없이 「없음」이다 */
export function isLatePassCode(code: string): boolean {
  if (!code.startsWith(LATE_PASS_PREFIX)) return false;
  const body = code.slice(LATE_PASS_PREFIX.length);
  return (
    body.length === LATE_PASS_LENGTH &&
    [...body].every((ch) => INVITE_ALPHABET.includes(ch))
  );
}

/** 사람이 읽는 모양 — `LTEXY7K3MPQ` → `LTE-XY7K-3MPQ` */
export function formatLatePassCode(code: string): string {
  const body = code.slice(LATE_PASS_PREFIX.length);
  return [LATE_PASS_PREFIX, body.slice(0, 4), body.slice(4)].filter(Boolean).join("-");
}

/**
 * 감사 로그에 남기는 코드 일부 — `LTE-XY7K-…`.
 *
 * 로그는 지우지 않는 기록이라 살아 있는 링크를 통째로 담지 않는다. 참가 관리의
 * 최근 링크 목록과 맞춰 볼 만큼만 적는다.
 */
export function latePassHint(code: string): string {
  return `${formatLatePassCode(code).slice(0, LATE_PASS_PREFIX.length + 5)}-…`;
}

/**
 * 편입 링크. 초대 링크(`inviteUrl`)와 같은 모양이다.
 *
 * `origin`은 참가 관리 화면(admin/entries/page.tsx `latePassOrigin`)이 서버에서 정한다 —
 * 운영에서는 메일 링크와 같은 `siteUrl()`, 개발·스테이징에서는 지금 요청의 주소다.
 */
export function latePassUrl(code: string, origin?: string): string {
  const path = `/apply?late=${encodeURIComponent(code)}`;
  return origin ? `${origin}${path}` : path;
}

// ═════════════════════════════════════════════════════════════
// 편입 기간
// ═════════════════════════════════════════════════════════════

/*
  편입을 받는 마지막 시각(`deadline`)은 **s1의 달력 마감**, 곧 s1 구간의 끝이다
  (PLN3 3.2 「racing(s1 구간)」). 읽는 곳은 late-entry-store `loadLateEntryDeadline`
  하나고, 왜 유동 게이트의 실제 마감(s1 제출 기한)이 아닌지도 거기 적었다. 여기
  함수들은 그 값을 받아 판정만 한다.
*/

/** 링크의 기한 = min(만든 때 + 7일, s1 달력 마감). 기한이 비면 7일만 */
export function latePassExpiry(createdAt: Date, deadline: Date | null): Date {
  const ttl = new Date(createdAt.getTime() + LATE_PASS_TTL_DAYS * 86_400_000);
  return deadline && deadline < ttl ? deadline : ttl;
}

/**
 * 지금 편입을 받지 않는 사유. 받으면 null.
 *
 *   RECRUITING    모집 중 — 링크 없이도 신청이 열려 있다. 링크를 만들 까닭이 없다
 *   PHASE_CLOSED  레이스가 아니다(사전 신청·시상·아카이브)
 *   S1_CLOSED     레이스 중이지만 s1 구간이 끝났다(달력 마감, `loadLateEntryDeadline`)
 *
 * 운영 콘솔의 「편입 링크 만들기」와 참가자 쪽 링크 판정(`latePassFailure`)이 이것
 * 하나를 본다 — 만들 수 없는 때 만든 링크가 받아지거나, 그 반대가 없게.
 */
export type LateEntryBlock = "RECRUITING" | "PHASE_CLOSED" | "S1_CLOSED";

export function lateEntryBlock(
  phase: SeasonPhase,
  deadline: Date | null,
  now: Date,
): LateEntryBlock | null {
  if (isRecruiting(phase)) return "RECRUITING";
  if (!isRacing(phase)) return "PHASE_CLOSED";
  if (deadline && deadline <= now) return "S1_CLOSED";
  return null;
}

/* 운영 콘솔의 버튼 자리에 서는 한 줄 — 운영 화면이라 명사형 */
export const LATE_ENTRY_BLOCK_MESSAGE: Record<LateEntryBlock, string> = {
  RECRUITING: "모집 중에는 참가 신청이 열려 있음",
  PHASE_CLOSED: "레이스 중에만 편입 가능",
  S1_CLOSED: "s1 구간이 끝나 편입 불가",
};

// ═════════════════════════════════════════════════════════════
// 링크 판정 — 참가 신청 화면과 신청 액션이 같이 쓴다
// ═════════════════════════════════════════════════════════════

/** 링크 하나를 가르는 재료. DB에서 읽은 값을 그대로 넣는다 */
export type LatePassCheck = {
  seasonId: string;
  usedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
};

export type LatePassFailureCode =
  | "LATE_PASS_NOT_FOUND"
  | "LATE_PASS_USED"
  | "LATE_PASS_REVOKED"
  | "LATE_PASS_CLOSED"
  | "LATE_PASS_EXPIRED";

/**
 * 이 링크로 지금 신청할 수 없는 사유. 되면 null.
 *
 * 순서: 없음 → 사용됨 → 취소됨 → 기간 아님 → 만료.
 *   · 다른 시즌의 링크는 「없음」이다 — 지난 시즌 링크로 이번 시즌에 들어오지 않게.
 *   · 기간을 만료보다 먼저 본다. 만료 문구는 「운영팀에 다시 문의」하라고 하는데,
 *     기간이 끝났으면 새 링크도 못 만든다(초대의 `inviteFailure`와 같은 이유).
 *   · 모집 중에도 「기간 아님」을 낸다. 모집 중에는 이 함수까지 오지 않는다
 *     (`applyGate`가 먼저 평소 신청으로 연다) — 혼자 불렸을 때 여는 쪽으로 틀리지 않게.
 */
export function latePassFailure(
  pass: LatePassCheck | null,
  season: { id: string; phase: SeasonPhase },
  deadline: Date | null,
  now: Date,
): LatePassFailureCode | null {
  if (!pass || pass.seasonId !== season.id) return "LATE_PASS_NOT_FOUND";
  if (pass.usedAt) return "LATE_PASS_USED";
  if (pass.revokedAt) return "LATE_PASS_REVOKED";
  if (lateEntryBlock(season.phase, deadline, now)) return "LATE_PASS_CLOSED";
  if (pass.expiresAt <= now) return "LATE_PASS_EXPIRED";
  return null;
}

/* 참가자에게 보이는 문구 — 초대의 `TEAM_FAILURE_MESSAGE`와 같은 어투 */
export const LATE_PASS_MESSAGE: Record<LatePassFailureCode, string> = {
  LATE_PASS_NOT_FOUND: "편입 링크를 찾을 수 없어요. 받은 주소를 다시 확인해 주세요.",
  LATE_PASS_USED: "이미 사용된 편입 링크예요.",
  LATE_PASS_REVOKED: "취소된 편입 링크예요. 운영팀에 다시 문의해 주세요.",
  /* 기간이 끝나서 닫힌 것 — 새 링크도 못 만들므로 문의하라고 하지 않는다 */
  LATE_PASS_CLOSED: "지금은 편입 링크로 참가할 수 없어요.",
  LATE_PASS_EXPIRED: "기한이 지난 편입 링크예요. 운영팀에 다시 문의해 주세요.",
};

/**
 * 새 참가 신청을 받는가 — 참가 신청 화면(page.tsx)과 신청 액션(apply-store
 * `submitApplication`)이 **이 함수 하나로** 가른다(late-entry-store `loadApplyGate`를 거쳐).
 * 화면이 폼을 그렸는데 제출이 막히는(혹은 그 반대인) 틈을 만들지 않는다.
 *
 *   open    모집 중 — 평소 신청. 링크를 들고 와도 평소 신청으로 받는다
 *   late    모집이 아닌데 유효한 편입 링크를 들고 왔다 — 평소 신청서를 그대로 받는다
 *   closed  받지 않는다. `failure`가 있으면 링크가 죽은 사유, 없으면 링크 없이 왔다
 *
 * ⚠️ 링크 없이는 레이스 중에 절대 열리지 않는다 — 문을 여는 것은 운영자의 링크뿐이다.
 */
export type ApplyGate =
  | { kind: "open" }
  | { kind: "late"; code: string }
  | { kind: "closed"; failure: LatePassFailureCode | null };

export function applyGate(input: {
  /** 모집 중인가 — 랜딩 CTA와 같은 판정(`resolveLandingCta(season).kind === "APPLY"`) */
  applyOpen: boolean;
  season: { id: string; phase: SeasonPhase } | null;
  /** `normalizeLatePassCode`를 거친 값. 링크 없이 왔으면 "" */
  code: string;
  pass: LatePassCheck | null;
  deadline: Date | null;
  now: Date;
}): ApplyGate {
  if (input.applyOpen) return { kind: "open" };
  if (!input.season || !input.code) return { kind: "closed", failure: null };
  const failure = latePassFailure(input.pass, input.season, input.deadline, input.now);
  return failure ? { kind: "closed", failure } : { kind: "late", code: input.code };
}

// ═════════════════════════════════════════════════════════════
// 대기 중인 링크 — 쓰기(사용·취소)의 조건과 목록의 상태가 같은 규칙이다
// ═════════════════════════════════════════════════════════════

/** 운영 콘솔 목록의 상태. 대기(pending)만 쓰거나 취소할 수 있다 */
export type LatePassStatus = "pending" | "used" | "revoked" | "expired";

export function latePassStatus(
  pass: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
  /**
   * 지금 편입을 받지 않는 사유(`lateEntryBlock`). 기한이 남았어도 레이스가 끝났거나
   * s1 구간이 끝났으면 참가자는 `LATE_PASS_CLOSED`를 본다 — 목록이 그 링크를
   * 「대기」라 부르며 복사 버튼을 달면 못 쓰는 링크를 건네게 된다(2026-09-26 리뷰 지적).
   * 모집 중(RECRUITING)은 빼는데, 그때는 링크가 평소 신청으로 이어져 여전히 쓸 수 있다.
   */
  block: LateEntryBlock | null = null,
): LatePassStatus {
  if (pass.usedAt) return "used";
  if (pass.revokedAt) return "revoked";
  if (pass.expiresAt <= now) return "expired";
  if (block === "PHASE_CLOSED" || block === "S1_CLOSED") return "expired";
  return "pending";
}

/**
 * 대기 중인 링크만 고르는 조건 — 사용(`claimLatePassIn`)과 취소(admin-store
 * `revokeLatePass`)가 `updateMany`의 where로 쓴다. 0건이면 그사이에 누가 먼저 썼거나
 * 취소했거나 기한이 지난 것이다.
 *
 * 읽고 나서 쓰지 않고 **조건부로 한 번에 쓰는** 이유: 같은 링크를 두 탭에서 동시에
 * 제출하면 둘 다 「대기」를 읽고 지나간다. 조건을 쓰기에 실으면 DB가 한 쪽만 통과시킨다.
 * 위 `latePassStatus`의 pending과 같은 규칙이다(late-entry.test.ts가 둘을 맞춰 본다).
 * 기간(`block`)은 여기 싣지 않는다 — 사용은 그 앞에서 `latePassFailure`가 이미 보고,
 * 기간이 끝난 링크를 취소하는 것은 막을 까닭이 없다.
 */
export function latePassPendingWhere(now: Date) {
  return { usedAt: null, revokedAt: null, expiresAt: { gt: now } };
}
