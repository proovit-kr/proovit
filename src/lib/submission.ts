import { z } from "@/lib/z";

import {
  JudgmentResult,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { AI_CHECKS, BUILDERS, LAUNCH_CHECKS } from "@/content/submission";
import { EVIDENCE_COUNT_MAX, EVIDENCE_KEY_MAX } from "@/lib/evidence";
import { seoulDateOnly } from "@/lib/measure";

/*
  제출의 **순수** 절반 — 길이·형식 규칙과 화면이 판을 읽는 규칙. 화면(클라이언트)도
  이 파일을 읽는다. 저장은 submission-store.ts에 있다.

  필드는 시안 ver4 `#scr-submit`이 정본이다(2026-09-22). s1은 심사 기준서 2-2의
  고도화 문서 10종으로 늘었고(①~⑩), s3에 가이드 완료 체크가 생겼다. 옛 PLN6 4장의
  다섯 칸(컨셉·문제 정의·핵심 기능·안 만들 것·위험한 가정)은 그대로 안에 있다.

  ⚠️ **필수 여부는 옛 다섯 칸만 건다.** 시안이 「글자 수 상한과 필수 여부는 PLN6
  필드 정의서가 기준서를 따라오면 확정돼요」라고 적어 둔 자리라, 새 칸은 상한만
  본다 — 안 채운 항목은 그 항목의 점수를 못 받을 뿐 제출을 막지 않는다. 정의서가
  오면 고칠 자리는 아래 `S1Schema` 한 곳이다.
*/

/** 단발 제출은 week=0. s4만 주차를 센다(PLN6 0장) */
export const SINGLE_WEEK = 0;

export const MEMO_MAX = 1000;

export function isStageKey(value: string): value is StageKey {
  return (Object.values(StageKey) as string[]).includes(value);
}

/** 화면이 구분해서 안내해야 하는 실패 */
export type SubmissionFailureCode =
  | "STAGE_CLOSED"
  | "STAGE_LOCKED"
  | "STAGE_NOT_OPEN"
  | "CHARGE_TYPE_LOCKED"
  | "GUIDE_INCOMPLETE"
  | "BUILDER_NAME"
  | "LAUNCH_INCOMPLETE"
  | "AI_INCOMPLETE"
  | "EVIDENCE_INVALID"
  | "NOT_FOUND";

export const SUBMISSION_FAILURE_MESSAGE: Record<SubmissionFailureCode, string> = {
  STAGE_CLOSED: "제출 마감이 지났어요.",
  STAGE_LOCKED: "심사가 시작돼 더 고칠 수 없어요.",
  STAGE_NOT_OPEN: "아직 열리지 않은 스테이지예요.",
  CHARGE_TYPE_LOCKED: "과금 유형은 첫 제출 뒤에 바꿀 수 없어요.",
  GUIDE_INCOMPLETE: "가이드 완료 체크를 모두 확인해 주세요.",
  BUILDER_NAME: "무엇으로 만들었는지 이름을 적어 주세요.",
  LAUNCH_INCOMPLETE:
    "출시 전 점검을 모두 확인해 주세요. 미충족 항목이 있으면 고친 뒤 배포하는 것이 규칙입니다(운영규칙 제22조).",
  AI_INCOMPLETE: "AI 표시 점검을 모두 확인해 주세요.",
  EVIDENCE_INVALID: "첨부한 파일을 찾을 수 없어요. 다시 올려 주세요.",
  NOT_FOUND: "이 스테이지를 찾을 수 없어요.",
};

/**
 * 임시 저장인가 제출인가.
 *
 * 임시 저장은 **검증을 통과하지 않아도 된다** — 쓰다 만 것을 잡아두는 것이 목적이다.
 * 제출은 전부 채워야 한다. 같은 폼에서 버튼만 다르다.
 */
export type SubmitIntent = "draft" | "submit";

/*
  ⚠️ 임시 저장 스키마는 `.partial()`로 못 만든다 — partial은 「칸이 없어도 된다」로
  바꿔줄 뿐, 빈 문자열은 **있는 값**이라 `min(1)`에 걸린다. 절반 쓴 폼이 저장되지
  않는다(8/14에 그렇게 짰다가 잡았다). 임시 저장이 지키는 것은 상한 하나다.
*/
const bounded = (max: number) =>
  z.string().trim().max(max, `${max}자까지 쓸 수 있어요.`);
const required = (max: number, message: string) =>
  bounded(max).min(1, message);
const httpsUrl = (message: string) =>
  required(LINK_MAX, message).refine(
    (value) => value.startsWith("https://"),
    "https:// 로 시작하는 주소여야 해요.",
  );

export const LINK_MAX = 500;
export const CHANNEL_MAX = 40;
export const CHANNEL_COUNT_MAX = 8;

const channelList = z
  .array(z.string().trim().max(CHANNEL_MAX))
  .max(CHANNEL_COUNT_MAX);

/* 증빙 파일 — 키 목록. 키의 모양과 소유는 저장할 때 다시 본다(evidence.ts) */
const fileList = z
  .array(z.string().max(EVIDENCE_KEY_MAX))
  .max(EVIDENCE_COUNT_MAX, `파일은 ${EVIDENCE_COUNT_MAX}개까지 올릴 수 있어요.`)
  .default([]);

// ── s1 — 아이디어 등록과 고도화 ───────────────────────────────

/* 시안 `.cnt`가 적어 둔 상한. 적지 않은 칸은 형태(한 줄·문단)에 맞춰 뒀다 */
export const CONCEPT_MAX = 200;
export const PERSONA_MAX = 300;
export const PROBLEM_MAX = 200;
export const PROBLEM_DOC_MAX = 5000;
export const SURVEY_SHORT_MAX = 100;
export const SURVEY_SUMMARY_MAX = 1000;
export const HYPOTHESIS_MAX = 300;
export const ALTERNATIVE_MAX = 200;
export const DIFFERENTIATION_MAX = 300;
export const CORE_FEATURE_MAX = 100;
export const NOT_BUILDING_MAX = 100;
export const BUILD_PLAN_MAX = 1000;
export const TIMELINE_MAX = 1000;
export const PRICING_MAX = 300;
export const MONETIZATION_MAX = 300;
export const RISKIEST_MAX = 200;

/** 「이번 시즌에 안 만들 것」·「기존 대안 분석」은 두 줄이다 — 시안 그대로 */
export const NOT_BUILDING_COUNT = 2;
export const ALTERNATIVE_COUNT = 2;

/** 시안 ③의 `.seg` — 전원 비지인 / 일부 지인 포함 */
export const SURVEY_STRANGER = ["all", "some"] as const;

const alternative = z.object({
  name: bounded(ALTERNATIVE_MAX),
  pain: bounded(ALTERNATIVE_MAX),
});

const s1Shared = {
  /* 「문제 정의 상세」의 파일 쪽 — 본문과 둘 중 하나(아래 S1Schema) */
  problemDocFiles: fileList,
  persona: bounded(PERSONA_MAX),
  problem: bounded(PROBLEM_MAX),
  surveyCount: bounded(SURVEY_SHORT_MAX),
  surveyChannel: bounded(SURVEY_SHORT_MAX),
  surveyStranger: z.enum(SURVEY_STRANGER).optional(),
  surveySummary: bounded(SURVEY_SUMMARY_MAX),
  hypothesisChange: bounded(HYPOTHESIS_MAX),
  alternatives: z.array(alternative).length(ALTERNATIVE_COUNT),
  differentiation: bounded(DIFFERENTIATION_MAX),
  buildPlan: bounded(BUILD_PLAN_MAX),
  timeline: bounded(TIMELINE_MAX),
  pricing: bounded(PRICING_MAX),
  monetizationPlan: bounded(MONETIZATION_MAX),
  /* 가이드 완료 체크 — 허브 골든패스와 1:1(content/hub.ts) */
  guideChecks: z.array(z.boolean()),
  evidence: fileList,
  /** 심사에 반영하지 않는다 */
  memo: z.string().trim().max(MEMO_MAX).optional(),
};

export const S1Schema = z
  .object({
    concept: required(CONCEPT_MAX, "한마디 컨셉을 적어 주세요."),
    /* 「문제 정의 상세」는 시안이 **직접 작성 또는 파일, 둘 중 하나 필수**다 — 아래 refine */
    problemDoc: bounded(PROBLEM_DOC_MAX),
    coreFeature: required(CORE_FEATURE_MAX, "핵심 가치 루프 하나를 적어 주세요."),
    /* 두 칸 모두 채워야 한다 — 「안 만들 것」을 하나만 적으면 범위가 안 좁혀진다 */
    notBuilding: z
      .array(required(NOT_BUILDING_MAX, "안 만들 것 두 개를 모두 적어 주세요."))
      .length(NOT_BUILDING_COUNT),
    riskiest: required(RISKIEST_MAX, "가장 위험한 가정을 적어 주세요."),
    ...s1Shared,
  })
  .refine((v) => v.problemDoc.length > 0 || v.problemDocFiles.length > 0, {
    path: ["problemDoc"],
    message: "문제 정의 상세를 적거나 파일을 올려 주세요.",
  });

export const S1DraftSchema = z.object({
  concept: bounded(CONCEPT_MAX),
  problemDoc: bounded(PROBLEM_DOC_MAX),
  coreFeature: bounded(CORE_FEATURE_MAX),
  notBuilding: z.array(bounded(NOT_BUILDING_MAX)),
  riskiest: bounded(RISKIEST_MAX),
  ...s1Shared,
});

export type S1Payload = z.infer<typeof S1Schema>;

// ── s2 — 랜딩, 수요조사 (GATE 1) ─────────────────────────────

/*
  ⚠️ **지표 칸은 스키마에 없다.** s2의 방문자·사전 신청자, s4의 주간 방문·가입,
  s5의 최종 지표는 전부 엣지가 세는 값이라 참가자가 입력하지 않는다(랜딩이 약속한
  「참가자가 숫자를 입력하지 않는다」). 화면은 읽어서 보여주기만 한다.
*/
export const S2Schema = z.object({
  landingUrl: httpsUrl("랜딩 주소를 적어 주세요."),
  /* 최소 한 개 — 「어디에 알렸는가」가 수요 신호의 출처다 */
  channels: channelList.refine(
    (list) => list.filter((item) => item.trim()).length > 0,
    "홍보한 채널을 최소 한 개 적어 주세요.",
  ),
  postUrl: httpsUrl("포스팅 링크를 적어 주세요."),
  guideChecks: z.array(z.boolean()),
  evidence: fileList,
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export const S2DraftSchema = z.object({
  landingUrl: bounded(LINK_MAX),
  channels: channelList,
  postUrl: bounded(LINK_MAX),
  guideChecks: z.array(z.boolean()),
  evidence: fileList,
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export type S2Payload = z.infer<typeof S2Schema>;

// ── s3 — AI 빌드와 배포 ──────────────────────────────────────

export const BUILDER_OTHER_MAX = 60;
export const LAUNCH_CHECK_COUNT = LAUNCH_CHECKS.length;
export const AI_CHECK_COUNT = AI_CHECKS.length;

const builderValues = BUILDERS.map((item) => item.value) as [
  (typeof BUILDERS)[number]["value"],
  ...(typeof BUILDERS)[number]["value"][],
];

/*
  서비스 주소. `https://`만 받는다 — 참가작이 개인정보를 받는 이상 평문 http는
  체크리스트 A8(전 구간 HTTPS)과 어긋난다. 주소의 소유 확인은 「측정 연동」이 한다.
*/
export const S3Schema = z.object({
  serviceUrl: httpsUrl("배포한 서비스 주소를 적어 주세요."),
  builder: z.enum(builderValues, "무엇으로 만들었는지 골라 주세요."),
  /* 「기타」를 골랐을 때만 쓴다. `s3Missing`이 짝을 본다 */
  builderOther: z.string().trim().max(BUILDER_OTHER_MAX).optional(),
  signupConnected: z.boolean(),
  paymentReturnRegistered: z.boolean(),
  launchChecks: z.array(z.boolean()).length(LAUNCH_CHECK_COUNT),
  /** 생성형 AI 결과물을 보여주는가(체크리스트 B0) */
  aiFeature: z.boolean(),
  aiChecks: z.array(z.boolean()).length(AI_CHECK_COUNT),
  guideChecks: z.array(z.boolean()),
  evidence: fileList,
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export const S3DraftSchema = z.object({
  serviceUrl: bounded(LINK_MAX),
  builder: z.string().trim(),
  builderOther: z.string().trim().max(BUILDER_OTHER_MAX).optional(),
  signupConnected: z.boolean(),
  paymentReturnRegistered: z.boolean(),
  launchChecks: z.array(z.boolean()),
  aiFeature: z.boolean(),
  aiChecks: z.array(z.boolean()),
  guideChecks: z.array(z.boolean()),
  evidence: fileList,
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export type S3Payload = z.infer<typeof S3Schema>;

/**
 * s3의 「전부 채웠는가」 — 스키마로는 못 잡는 것.
 *
 * 체크박스는 타입이 boolean이라 **전부 false여도 스키마를 통과하고**, 「기타」
 * 빌더는 이름 칸과 짝이어야 한다. 화면과 서버가 같은 함수를 부른다 — 버튼을
 * 잠그는 조건과 거절하는 조건이 갈리면 "왜 안 되는지"를 설명할 수 없다.
 */
export function s3Missing(value: {
  builder: string;
  builderOther?: string;
  launchChecks: boolean[];
  aiFeature: boolean;
  aiChecks: boolean[];
}): "BUILDER_NAME" | "LAUNCH_INCOMPLETE" | "AI_INCOMPLETE" | null {
  if (value.builder === "other" && !value.builderOther?.trim()) {
    return "BUILDER_NAME";
  }
  if (
    value.launchChecks.length !== LAUNCH_CHECK_COUNT ||
    !value.launchChecks.every(Boolean)
  ) {
    return "LAUNCH_INCOMPLETE";
  }
  /* B0이 꺼져 있으면 PART B는 해당 없음이다 */
  if (value.aiFeature && !value.aiChecks.every(Boolean)) return "AI_INCOMPLETE";
  return null;
}

// ── s4 — 마케팅과 유저 유입 (주간 반복) ──────────────────────

export const ACTIVITY_MAX = 1000;
export const IMPROVED_MAX = 200;

export const S4Schema = z.object({
  activity: required(ACTIVITY_MAX, "이번 주에 한 활동을 적어 주세요."),
  channels: channelList,
  improved: z.string().trim().max(IMPROVED_MAX).optional(),
  guideChecks: z.array(z.boolean()),
  evidence: fileList,
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export const S4DraftSchema = z.object({
  activity: bounded(ACTIVITY_MAX),
  channels: channelList,
  improved: z.string().trim().max(IMPROVED_MAX).optional(),
  guideChecks: z.array(z.boolean()),
  evidence: fileList,
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export type S4Payload = z.infer<typeof S4Schema>;

// ── s5 — 트래픽과 매출 (GATE 2) ──────────────────────────────

export const RETRO_MAX = 2000;

/*
  s5는 입력이 아니라 **확인**이다(시안 안내줄). 최종 지표는 마감에 자동 확정되므로
  여기서 받는 것은 그 지표를 어떻게 읽어야 하는지에 대한 신고 둘(수익화 시도·결제
  연동)과 회고, 그리고 아카이브 공개 동의다.
*/
export const S5Schema = z.object({
  monetized: z.boolean(),
  paymentConnected: z.boolean(),
  retro: required(RETRO_MAX, "회고를 적어 주세요."),
  guideChecks: z.array(z.boolean()),
  evidence: fileList,
  /* 필수 동의다 — 아카이브 공개의 근거가 이 값뿐이다 */
  archiveConsent: z.boolean().refine((value) => value, "아카이브 공개 동의가 필요해요."),
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export const S5DraftSchema = z.object({
  monetized: z.boolean(),
  paymentConnected: z.boolean(),
  retro: bounded(RETRO_MAX),
  guideChecks: z.array(z.boolean()),
  evidence: fileList,
  archiveConsent: z.boolean(),
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export type S5Payload = z.infer<typeof S5Schema>;

/**
 * 가이드 완료 체크가 전부 켜졌는가. 스키마로는 못 잡는다 — 체크박스는
 * 전부 false여도 통과한다(`s3Missing`과 같은 이유).
 */
export function guideIncomplete(checks: boolean[], count: number): boolean {
  return checks.length !== count || !checks.every(Boolean);
}

export type SubmissionFieldErrors = Partial<Record<string, string[]>>;

// ═════════════════════════════════════════════════════════════
// 화면이 판을 읽는 규칙 — 탭 꼬리·머리 배지·메타·발자국
// ═════════════════════════════════════════════════════════════

/** 한 스테이지의 상태. 서버(submission-store)가 채우고 순수 함수들이 읽는다 */
export type StageState = {
  stageKey: StageKey;
  opensAt: Date | null;
  closesAt: Date | null;
  /** 지금 보는 제출(s4는 이번 주차). 없으면 아직 아무것도 안 했다 */
  status: SubmissionStatus | null;
  /** 게이트 판정. 없으면 null */
  judgment: JudgmentResult | null;
  /** s4의 주차. 나머지는 0 */
  week: number;
};

export type Tail =
  | { kind: "badge"; tone: "lime" | "red" | "warn" | "gray"; label: string }
  | { kind: "chip"; label: string };

/*
  탭 꼬리 — 시안 `.st-tab`의 배지·칩.

    통과 → 「통과」(lime)   미통과 → 「미통과」(red)   보완 → 「보완」(warn)
    제출됨 → 「제출됨」(gray)   임시저장 → 「작성 중」(warn)
    s4 → 「주간 반복」 칩(시안이 2주차 작성 중인 판에도 이 칩을 단다)
    아직 안 열림 → 「예정」 칩   열렸는데 아무것도 없음 → 없음

  시안에 있는 것은 위 다섯 판(제출됨·통과·작성 중·주간 반복·예정)이고 나머지는
  같은 규칙을 이은 것이다.
*/
export function tabTail(state: StageState, now: Date): Tail | null {
  if (state.stageKey === StageKey.s4) return { kind: "chip", label: "주간 반복" };
  if (state.judgment === JudgmentResult.pass) {
    return { kind: "badge", tone: "lime", label: "통과" };
  }
  if (state.judgment === JudgmentResult.fail) {
    return { kind: "badge", tone: "red", label: "미통과" };
  }
  if (state.judgment === JudgmentResult.revision) {
    return { kind: "badge", tone: "warn", label: "보완" };
  }
  if (state.status === SubmissionStatus.draft) {
    return { kind: "badge", tone: "warn", label: "작성 중" };
  }
  if (state.status !== null) return { kind: "badge", tone: "gray", label: "제출됨" };
  if (!isOpen(state, now)) return { kind: "chip", label: "예정" };
  return null;
}

/*
  머리 배지 — 시안 `.frm-hd .badge`. 탭과 달리 DB 값 그대로다(submitted·pass·draft).
  s4만 「2주차 작성 중」처럼 주차를 붙인다.
*/
export function paneBadge(
  state: StageState,
  now: Date,
): { tone: "lime" | "red" | "warn" | "gray"; label: string } | null {
  if (state.stageKey === StageKey.s4 && state.status) {
    return state.status === SubmissionStatus.draft
      ? { tone: "warn", label: `${state.week}주차 작성 중` }
      : { tone: "gray", label: `${state.week}주차 제출됨` };
  }
  if (state.judgment === JudgmentResult.pass) return { tone: "lime", label: "pass" };
  if (state.judgment === JudgmentResult.fail) return { tone: "red", label: "fail" };
  if (state.judgment === JudgmentResult.revision) return { tone: "warn", label: "revision" };
  if (state.status === SubmissionStatus.draft) return { tone: "warn", label: "draft" };
  if (state.status !== null) return { tone: "gray", label: "submitted" };
  if (!isOpen(state, now)) return { tone: "gray", label: "예정" };
  return null;
}

/** 열렸는가. 시작일이 비어 있으면(시즌1 일정 잠정) 열린 것으로 본다 */
export function isOpen(state: { opensAt: Date | null }, now: Date): boolean {
  return state.opensAt === null || state.opensAt.getTime() <= now.getTime();
}

const DAY_MS = 86_400_000;

/**
 * 마감 표기 — 시안 `마감 10.04 23:59`·`집계 확정 11.01 24:00`.
 *
 * 자정에 닫히는 마감은 **전날 24:00**으로 적는다. 「11.17 00:00」은 하루를 더
 * 주는 것처럼 읽히고, 시안도 그 자리를 24:00으로 썼다.
 */
export function formatDeadline(at: Date): string {
  const part = seoulParts(at);
  if (part.hour === "00" && part.minute === "00") {
    const prev = seoulParts(new Date(at.getTime() - DAY_MS));
    return `${prev.month}.${prev.day} 24:00`;
  }
  return `${part.month}.${part.day} ${part.hour}:${part.minute}`;
}

/** 시각 표기 — 시안 `제출 이윤서, 10.02 21:14` */
export function formatMoment(at: Date): string {
  const part = seoulParts(at);
  return `${part.month}.${part.day} ${part.hour}:${part.minute}`;
}

/** 날짜만 — 시안 s2의 `10.05~10.10` */
export function formatDay(at: Date): string {
  const part = seoulParts(at);
  return `${part.month}.${part.day}`;
}

function seoulParts(at: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
}

/**
 * 남은 날 — 시안 `D-4`. 서울 달력으로 센다(마감일 − 오늘). 자정 마감은
 * `formatDeadline`과 같은 이유로 전날이 마감일이다. 지났으면 null.
 */
export function dDay(closesAt: Date, now: Date): string | null {
  if (closesAt.getTime() <= now.getTime()) return null;
  const due = seoulDateOnly(new Date(closesAt.getTime() - 60_000));
  const today = seoulDateOnly(now);
  const days = Math.round((due.getTime() - today.getTime()) / DAY_MS);
  return days <= 0 ? "D-day" : `D-${days}`;
}

/**
 * 지금이 s4의 몇 주차인가. 스테이지 시작일로부터 몇 번째 7일 구간인지가 곧
 * 주차다 — 참가팀이 고르지 않는다. 시작일이 비어 있으면 1주차로 둔다.
 */
export function currentWeek(opensAt: Date | null, now: Date): number {
  if (!opensAt) return 1;
  const days = Math.floor((now.getTime() - opensAt.getTime()) / DAY_MS);
  return Math.max(1, Math.floor(days / 7) + 1);
}

/** 그 주차의 구간. 주간 지표를 그 구간으로만 센다 */
export function weekRange(opensAt: Date | null, week: number) {
  if (!opensAt) return { from: null, to: null };
  const from = new Date(opensAt.getTime() + (week - 1) * 7 * DAY_MS);
  const to = new Date(from.getTime() + 7 * DAY_MS - 60_000);
  return { from, to };
}

/** 전환율 — 시안 `5.1%`. 방문이 없으면 null */
export function conversionRate(leads: number, visitors: number): string | null {
  if (visitors <= 0) return null;
  return `${((leads / visitors) * 100).toFixed(1)}%`;
}
