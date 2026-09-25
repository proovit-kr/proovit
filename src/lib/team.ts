import {
  EntryStatus,
  InvitationStatus,
  type SeasonPhase,
  StageKey,
} from "@/generated/prisma/enums";
import { formatDeadline } from "@/lib/kst-format";
import { isRacing, isRecruiting } from "@/lib/season-phase";
import { z } from "@/lib/z";

/*
  팀 관리의 **순수** 절반. DB도 세션도 모른다 — 화면(클라이언트)도 이 파일을 읽는다.
  쓰기는 team-store.ts에 있다. apply.ts / apply-store.ts를 가른 것과 같은 형태다.

  ⚠️ 그래서 enum은 `@/generated/prisma/enums`에서, 페이즈 술어는 season-phase.ts에서
  가져온다. `@/generated/prisma/client`나 access-policy.ts를 끌어오면 클라이언트
  번들에 DB 클라이언트가 딸려 간다(access-policy.ts 머리 주석). 마감 표기도 같은
  이유로 의존성 없는 kst-format.ts에서 가져온다 — submission.ts를 끌어오면 제출
  스키마와 콘텐츠가 TeamPanel 번들에 따라갈 수 있다(2026-09-26).
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
 *
 * → 2026-09-26 뒤집음(반만): 합류 마감이 진도에서 **날짜**(s1 달력 마감)로 바뀌어,
 * 초대 메일이 적는 「유효 기한」(발급 + 7일)이 실제 마감보다 늦은 날일 수 있게 됐다.
 * 받는 사람은 메일의 날짜를 믿고 기다린다. 그래서 **메일에 적는 기한**은 만료와 합류
 * 마감 중 이른 쪽이다(`inviteValidUntil`). 만료 시각 자체(행의 `expires_at`)는
 * 그대로 7일이다 — 운영자가 s1 마감을 뒤로 옮기면 그만큼 더 받을 수 있게.
 * 내가 정함(수연 확인 대기).
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
  (옛 `JOIN_STAGES = [applied, s1]`) **실제로 닫히는 때는 s2를 낸 순간**이었다.
  문구도 그렇게 적었다(JOIN_CLOSED 「s2 제출 전까지」). 「s1을 내기 전까지」로
  좁히려면 s1 한 줄을 빼면 됐다 — 내가 정함(수연 확인 대기).

  → 2026-09-26 뒤집음(수연 지시 「팀원 합류 기준: 절대 날짜로 바꿔」): 「s1까지」를
  **s1 달력 마감**(`stages` s1 행의 `closes_at` 원값)으로 읽는다. 진도는 보지 않는다 —
  `JOIN_STAGES`를 지웠다.
    · PLN3 3.2가 지각을 「racing(s1 구간)」으로 부른다. 구간은 달력이고, FR-B3의
      「recruiting~s1」도 같은 구간으로 읽는다.
    · 진도로 두면 s1을 일찍 낸 팀이 먼저 막힌다 — 빨리 한 팀이 손해를 본다.
    · 지각 편입 링크도 s1 달력 마감에 닫힌다. 두 기준이 같은 날이면 가이드와 QA가
      날짜 하나만 알면 된다.
  ⚠️ **유동 게이트의 실제 마감이 아니다.** s1의 실제 창은 1차 심사 마감까지 늘었지만
  (submission.ts `stageWindows`) 합류는 달력 원값에서 닫는다. hub-read의
  `stageDueAt(…, s1)`은 실제 마감(= 1차 심사 마감)을 돌려주므로 여기 쓰지 않는다.
  재료는 `loadJoinWindow`(team-store) 하나로 읽고, s1 행을 고르는 일은 순수 함수
  `joinWindowFrom`이 한다(테스트가 달력 원값임을 고정한다).
  그래서 화면 문구도 합류 마감을 「s1 마감」이라 부르지 않는다(`JOIN_CLOSED` 주석).
*/

/**
 * 합류 기간을 가르는 재료. **시즌 하나에 하나**다 — 팀마다 다르지 않다.
 * 읽는 곳은 `loadJoinWindow`(team-store) 하나다. 팀 관리 화면·액션과 초대
 * 조회·수락이 전부 그것을 거쳐, 한쪽만 다른 마감을 집는 일이 없게 한다.
 */
export type JoinWindow = {
  phase: SeasonPhase;
  /** `stages` s1 행의 `closes_at`(달력 원값). 비어 있으면 일정이 잠정이다 */
  s1ClosesAt: Date | null;
  /**
   * 판정의 지금 — 개발 시계(`devNow`)를 따른다. 일정이 정본이고 오늘이 움직이는
   * 개발 바에서 「s1 마감 뒤」를 세우려면 이 값이 옮겨져야 한다(dev-clock.ts).
   */
  now: Date;
};

/**
 * 시즌의 스테이지 행에서 합류 기간을 만든다 — `loadJoinWindow`(team-store)가 읽은
 * 행을 그대로 넘긴다.
 *
 * s1 행의 `closes_at` **원값**을 고른다. `stageWindows`(submission.ts)를 거치지
 * 않는다 — 거치면 s1이 뒤 게이트(s2)의 마감까지 늘어나, 합류가 1차 심사 마감에
 * 닫힌다. 이 선택이 명세의 핵심이라 순수 함수로 떼어 테스트가 고정한다
 * (team.test.ts, 2026-09-26 리뷰 지적).
 */
export function joinWindowFrom(
  stages: readonly { stageKey: StageKey; closesAt: Date | null }[],
  phase: SeasonPhase,
  now: Date,
): JoinWindow {
  const s1 = stages.find((stage) => stage.stageKey === StageKey.s1);
  return { phase, s1ClosesAt: s1?.closesAt ?? null, now };
}

/** s1 달력 마감이 지났는가. 마감 시각과 같은 순간이면 지난 것이다(제출 창과 같다) */
function s1Passed(joinWindow: JoinWindow): boolean {
  return (
    joinWindow.s1ClosesAt !== null &&
    joinWindow.s1ClosesAt.getTime() <= joinWindow.now.getTime()
  );
}

/**
 * 합류(초대 수락)를 받는 페이즈인가 — 모집과 레이스.
 *
 * ⚠️ **새 참가 신청과 다르다.** 신청은 여전히 모집 구간에만 받는다
 * (apply-store `submitApply`·/apply 화면의 `resolveLandingCta`). 합류는 이미 있는
 * 참가에 사람을 붙이는 일이라 레이스 중에도 열고, s1 달력 마감은 `joinClosedCode`가
 * 본다(2026-09-26 전에는 팀별 진도였다).
 */
export function isJoinPhase(phase: SeasonPhase): boolean {
  return isRecruiting(phase) || isRacing(phase);
}

/**
 * 합류를 막는 사유. `TEAM_FAILURE_MESSAGE`로 그대로 안내한다.
 *
 * 페이즈로 닫힌 것(JOIN_PHASE_CLOSED)과 s1 마감으로 닫힌 것(JOIN_CLOSED)을 가른다 —
 * 하나로 두면 시상 중 팀 관리 화면이 「합류 기간이 끝났다」를 말한다(시상 중에는
 * 기간이 아니라 페이즈가 이유다).
 */
export type JoinClosedCode = "JOIN_PHASE_CLOSED" | "JOIN_CLOSED" | "TEAM_INACTIVE";

/**
 * 시즌 전체에 걸리는 합류 마감 — 팀과 무관하게 페이즈와 s1 달력 마감만 본다.
 *
 * `joinClosedCode`의 앞 두 줄이다. 따로 둔 이유는 /apply가 **로그인 앞에서** 이것만
 * 보고 끊기 때문이다 — 마감은 시즌의 날짜라 초대 코드를 풀지 않아도 안다
 * (2026-09-26 리뷰 지적). 팀의 상태까지 보는 판정은 `joinClosedCode`다.
 */
export function joinWindowClosed(
  joinWindow: JoinWindow,
): "JOIN_PHASE_CLOSED" | "JOIN_CLOSED" | null {
  if (!isJoinPhase(joinWindow.phase)) return "JOIN_PHASE_CLOSED";
  if (isRacing(joinWindow.phase) && s1Passed(joinWindow)) return "JOIN_CLOSED";
  return null;
}

/**
 * 이 팀에 지금 팀원이 합류할 수 있는가. 열려 있으면 null, 닫혀 있으면 사유.
 *
 * `entry`는 **초대가 가리키는 팀의 이번 시즌 참가**다(합류하는 사람의 것이 아니다).
 * 합류·초대 화면(`inviteFailure`를 거쳐)과 초대 발급·재발송(팀 관리 액션)이
 * 전부 이 함수 하나를 부른다 — 발급해 봐야 받을 수 없는 초대를 메일로 보내지 않게.
 *
 * 순서: 페이즈 → 생존 상태 → 진도.
 *   → 2026-09-26 뒤집음: **페이즈 → s1 달력 마감 → 생존 상태.** 진도 자리를 날짜가
 *   받았고, 날짜는 페이즈처럼 시즌 전체에 걸리는 사유라 상태보다 앞에 둔다 — 마감이
 *   지난 뒤에는 어느 팀의 초대든 같은 문구가 나간다. 내가 정함(수연 확인 대기).
 *   · 모집·레이스가 아니면 닫힌다(사전신청·시상·아카이브·draft).
 *   · 레이스 중에는 **s1 달력 마감 전까지** 받는다(2026-09-26 수연 지시). 진도는
 *     보지 않는다 — s1·s2를 낸 팀도 마감 전이면 받는다. 그래서 `entry`에 stage가 없다.
 *   · s1 마감이 비어 있으면(일정 잠정) 레이스 중에도 열린 것으로 본다 — 마감을
 *     모르는데 닫으면 지각 합류가 통째로 막힌다. 내가 정함(수연 확인 대기, 2026-09-26).
 *   · 탈락·실격·포기한 팀에는 안 붙인다 — **모집 중에도 그렇다.** 운영자가 모집
 *     중에 실격시킨 팀에 사람이 붙는 길을 남기지 않는다. 내가 정함(수연 확인 대기).
 *   · 진도는 **모집 중에도 똑같이 본다.** 제출은 페이즈로 잠기지 않아
 *     (`stages.opens_at`이 비면 열린다 · submission-store) 모집 중에 s2를 낸 팀이
 *     있을 수 있다. 모집 중에만 풀어 두면 그 팀의 대기 초대가 레이스로 넘어가는
 *     순간 소리 없이 죽는다. PRD 「recruiting~s1」을 「모집 중엔 전부」로 읽지
 *     않은 것이다 — 내가 정함(수연 확인 대기, 2026-09-25).
 *     → 2026-09-26 뒤집음: 진도를 안 보므로 이 사정이 없어졌다. 모집 중에는 날짜도
 *     보지 않는다 — 모집 페이즈가 곧 「recruiting~s1」의 앞쪽이고, 그 사이에 s1
 *     달력 마감이 올 일정은 없다(s1은 레이스 안의 구간이다).
 */
export function joinClosedCode(
  joinWindow: JoinWindow,
  entry: { status: EntryStatus },
): JoinClosedCode | null {
  const seasonClosed = joinWindowClosed(joinWindow);
  if (seasonClosed) return seasonClosed;
  if (entry.status !== EntryStatus.active) return "TEAM_INACTIVE";
  return null;
}

/**
 * 받는 사람에게 적는 초대의 기한 — 만료(`expiresAt`)와 합류 마감(s1 달력 마감) 중
 * 이른 쪽. 초대 메일의 「유효 기한」이 이것이다(2026-09-26 리뷰 지적 — 10.15에 발급하면
 * 만료는 10.22인데 합류는 10.18 23:59에 닫힌다).
 *
 * 모집 중에도 s1 마감과 견준다 — 모집 중에 보낸 초대도 레이스로 넘어가 s1 마감에
 * 닫힌다. s1 마감이 이미 지났으면(모집이 길어진 시즌 같은 경우) 견주지 않는다 —
 * 지난 날짜를 적으면 받을 수 있는 초대를 죽은 것처럼 말한다. 페이즈로 닫혔으면
 * 발급·재발송 자체를 막으므로 여기 오지 않는다. 내가 정함(수연 확인 대기).
 */
export function inviteValidUntil(expiresAt: Date, joinWindow: JoinWindow): Date {
  const closesAt = joinWindow.s1ClosesAt;
  if (!closesAt || s1Passed(joinWindow)) return expiresAt;
  return closesAt.getTime() < expiresAt.getTime() ? closesAt : expiresAt;
}

/**
 * 팀장이 「개인 참가로 확정」할 수 있는가 — 합류가 **s1 달력 마감으로** 닫혔는데
 * 혼자 남은 비솔로 팀.
 *
 * 왜 필요한가(2026-09-26 리뷰 지적): 「팀 구성 완료」는 `isSolo || 2인`이다(access.ts).
 * 초대를 보내면 `isSolo`가 꺼지고(createInviteIn), 개인 참가는 참가 신청 때만 고를
 * 수 있었다. 옛 규칙(진도)에서는 온보딩 중인 applied 팀에 합류가 늘 열려 있어 허브의
 * 「팀 구성하기」가 늘 할 수 있는 일이었다. 날짜로 닫히면서 초대받은 사람이 끝내 안
 * 들어온 팀, 마감 뒤 팀원이 나간 팀은 팀 구성을 끝낼 길이 사라졌다 — 허브는 계속
 * 팀 관리 화면으로 보내는데 거기 누를 것이 없었다. 그 자리에 이 확정을 둔다.
 *
 * 합류가 열려 있을 때는 두지 않는다 — 그때는 초대가 먼저다(시안 ② 「한 명 더 초대할
 * 수 있어요」). 페이즈·팀 상태로 닫힌 때도 두지 않는다 — 허브가 온보딩을 묻는 판이
 * 아니다. 내가 정함(수연 확인 대기).
 */
export function soloConfirmable(input: {
  closed: JoinClosedCode | null;
  memberCount: number;
  isSolo: boolean;
}): boolean {
  return input.closed === "JOIN_CLOSED" && input.memberCount === 1 && !input.isSolo;
}

/** 초대 하나로 합류할 수 있는지 가르는 재료. DB에서 읽은 값을 그대로 넣는다 */
export type InviteCheck = {
  status: InvitationStatus;
  expiresAt: Date;
  /** 초대가 가리키는 팀의 지금 인원 */
  memberCount: number;
  /** 그 팀의 이번 시즌 참가. 없으면 붙을 참가가 없다 */
  entry: { status: EntryStatus } | null;
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
 *
 * ⚠️ **시계가 둘이다**(2026-09-26). 합류 기간은 `joinWindow.now`(개발 시계)로,
 * 초대 만료는 `now`(**진짜 지금**)로 본다. 만료 시각은 발급할 때 진짜 시계로
 * 찍혔고(createInvite), 팀 관리 화면도 진짜 지금으로 살아 있는 초대를 고른다
 * (loadTeamPanel). 개발 시계로 만료를 재면 개발 바에서 날짜를 옮기는 순간 화면에
 * 떠 있는 초대가 조회에서는 만료로 나온다. 운영에서는 둘이 같다.
 */
export function inviteFailure(
  invite: InviteCheck | null,
  joinWindow: JoinWindow,
  now: Date,
): InviteFailureCode | null {
  if (!invite) return "INVITE_NOT_FOUND";
  if (invite.status !== InvitationStatus.pending) return "INVITE_USED";
  /* 이번 시즌에 참가하지 않은 팀의 초대 — 붙을 참가가 없다 */
  if (!invite.entry) return "INVITE_NOT_FOUND";
  const closed = joinClosedCode(joinWindow, invite.entry);
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
  | "SOLO_UNAVAILABLE"
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
  /* 「개인 참가로 확정」을 합류가 열려 있을 때·2인 팀·이미 개인 참가인 팀이 눌렀을 때 */
  SOLO_UNAVAILABLE: "지금은 개인 참가로 확정할 수 없어요.",
  /*
    「s1 제출까지」가 아니다 — s1을 낸 팀도 s2를 내기 전까지는 받는다(JOIN_STAGES).
    초대받는 쪽과 팀장 쪽이 같은 문구를 읽으므로 주어를 팀원으로 둔다.

    → 2026-09-26 뒤집음: 진도가 아니라 s1 **달력 마감**에서 닫힌다(수연 지시 「절대
    날짜로」). 날짜는 여기 넣지 않는다(정적 문구다). 날짜는 열려 있을 때
    `joinDeadlineNote`가 미리 말한다.

    ⚠️ **「s1 마감」이라고 부르지 않는다**(2026-09-26 리뷰 지적). 참가자 화면에서
    「s1 마감」은 이미 유동 게이트의 실제 마감(= s2 게이트 마감, hub-read
    `stageDueAt`)을 가리킨다 — 허브 경고줄 「s1 마감(10.25 …)은 동일해요」와 s1 판
    「마감은 …예요」. 합류는 달력 원값(10.18)에서 닫혀서, 같은 이름이 두 날짜가 된다.
    허브 쪽을 달력값으로 바꾸면 유동 게이트 결정과 부딪히므로, 합류 문구가 라벨을
    버리고 「팀원 합류」 자체의 마감으로 부른다. 내가 정함(수연 확인 대기).
  */
  JOIN_CLOSED: "팀원 합류 기간이 끝났어요.",
  /* 모집·레이스 밖(시상·아카이브 등). 기간 탓이 아니라서 기간을 말하지 않는다 */
  JOIN_PHASE_CLOSED: "지금은 팀원을 받지 않아요.",
  /* 탈락·실격·포기 — 팀의 사정을 초대받는 사람에게 풀어 말하지 않는다 */
  TEAM_INACTIVE: "지금은 이 팀에 합류할 수 없어요.",
};

/*
  레이스 중 살아 있는 초대 밑에 붙이는 안내(팀 관리 화면). 초대 메일의 기한은 7일인데
  팀장이 s2를 내면 그보다 먼저 닫힌다 — 말하지 않으면 초대가 경고 없이 죽는다.
  모집 중에는 붙이지 않는다(시안 ②의 초대 대기 상자에 힌트가 없다).
  내가 정함(수연 확인 대기, 2026-09-25).

  → 2026-09-26 뒤집음: 닫히는 때가 s2 제출이 아니라 s1 달력 마감이 되어, 조건 대신
  **날짜**를 적는다 — 「팀원 합류는 10.18 23:59까지예요.」 표기는 제출 화면의
  `formatDeadline`을 그대로 쓴다(자정 마감은 전날 24:00). 자리는 그대로다 — 레이스 중,
  합류가 열려 있을 때만. 마감이 비어 있으면(일정 잠정) 적을 날짜가 없어 붙이지 않는다.
  예전 상수 `JOIN_DEADLINE_NOTE`를 이 함수가 대신한다.
  「s1 마감(…)」이라고 부르지 않는 이유는 `JOIN_CLOSED` 주석 — 허브의 「s1 마감」과
  다른 날이다. 내가 정함(수연 확인 대기).
*/
export function joinDeadlineNote(joinWindow: JoinWindow): string | null {
  const closesAt = joinWindow.s1ClosesAt;
  if (!isRacing(joinWindow.phase) || !closesAt || s1Passed(joinWindow)) {
    return null;
  }
  return `팀원 합류는 ${formatDeadline(closesAt)}까지예요.`;
}
