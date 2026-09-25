import { z } from "@/lib/z";

import {
  JudgmentResult,
  StageKey,
  SubmissionStatus,
} from "@/generated/prisma/enums";
import { AI_CHECKS, BUILDERS, LAUNCH_CHECKS } from "@/content/submission";
import { EVIDENCE_COUNT_MAX, EVIDENCE_KEY_MAX } from "@/lib/evidence";
import { formatDay } from "@/lib/kst-format";
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
  /**
   * **달력** 시작일(`stages.opens_at` 그대로). 열림 판정에는 쓰지 않는다 — 그건
   * `open`이다. s4 주차의 기산일이라 남긴다(`currentWeek`·`weekRange`).
   */
  opensAt: Date | null;
  /** **실제** 마감(`stageWindows`). 게이트가 아닌 스테이지는 뒤 게이트의 마감이다 */
  closesAt: Date | null;
  /**
   * 「예정」이 아닌가(`stageRowState`) — 실제 창이 시작됐고 **진도로도 닿거나**
   * (access-policy `stageReachable`), 이미 마감이 지났다. 고칠 수 있는지는
   * lockedReason이 따로 말한다.
   */
  open: boolean;
  /** 지금 보는 제출(s4는 이번 주차). 없으면 아직 아무것도 안 했다 */
  status: SubmissionStatus | null;
  /** 게이트 판정. 없으면 null */
  judgment: JudgmentResult | null;
  /** s4의 주차. 나머지는 0 */
  week: number;
};

/**
 * 한 스테이지의 실제 창. 시각이 null이면 「달력이 막지 않는다」.
 * `gate`는 이 창을 닫는 게이트 — 게이트면 자기, 아니면 뒤 첫 게이트, 없으면 null.
 */
export type StageWindow = {
  opensAt: Date | null;
  closesAt: Date | null;
  gate: StageKey | null;
};

/**
 * 스테이지별 **실제 창** — 유동 게이트(2026-09-25 수연 지시: 「제출하면 바로 다음
 * 단계가 열리도록」).
 *
 * 근거는 셋이 같은 말을 한다. PRD 2장 「팀별 유동 게이트(제출·통과 시 즉시 다음
 * 스테이지 오픈), 고정 일정은 심사 마감 2개뿐. 빨리 배포한 팀이 측정 기간을 길게
 * 가져간다」, 규칙 게시본 ru-2 「관문 외 스테이지는 제출 즉시 다음 단계가 열림」,
 * 심사 기준서 2장 「고정된 것은 1차 심사 마감뿐」.
 *
 *   여는 시각  첫 스테이지(개막)와 마지막 스테이지만 달력을 따른다. 그 사이는
 *              null — 진도가 연다(access-policy `stageReachable`).
 *   닫는 시각  게이트는 자기 마감. 게이트가 아니면 **그 뒤 첫 게이트의 마감**
 *              (뒤에 게이트가 없으면 자기 마감). 시즌1은 s1→s2 마감, s3·s4→s5 마감.
 *
 * 마지막 스테이지(s5)를 달력으로 여는 이유 — s5는 최종 집계 **확인**이라(FR-H6
 * 자동 제출) 「제출해서 끝낸다」가 없고, 앞의 s4가 주간 반복이라 「s4를 마쳤다」는
 * 순간도 없다. 집계 확정 구간은 모두에게 같아야 한다.
 * ⚠️ s5 여는 시각을 달력으로 둔 것은 내가 정함(수연 확인 대기).
 *
 * `stages` 행의 달력 값은 그대로 **시즌 권장 일정**이다 — 공개 화면·운영 콘솔·
 * 운영자 헤더는 달력을 적고, 참가자의 제출 가능 여부만 이 창을 본다.
 * 입력은 정렬을 가정하지 않는다(스테이지 번호 순으로 다시 세운다).
 */
export function stageWindows(
  stages: readonly {
    stageKey: StageKey;
    isGate: boolean;
    opensAt: Date | null;
    closesAt: Date | null;
  }[],
): Partial<Record<StageKey, StageWindow>> {
  const order = (key: StageKey) => Number(key.slice(1));
  const sorted = [...stages].sort((a, b) => order(a.stageKey) - order(b.stageKey));
  const out: Partial<Record<StageKey, StageWindow>> = {};
  sorted.forEach((stage, i) => {
    const edge = i === 0 || i === sorted.length - 1;
    const gate = stage.isGate ? stage : sorted.slice(i + 1).find((s) => s.isGate);
    out[stage.stageKey] = {
      opensAt: edge ? stage.opensAt : null,
      closesAt: (gate ?? stage).closesAt,
      gate: gate?.stageKey ?? null,
    };
  });
  return out;
}

/** 실제 창이 시작됐는가. 시작일이 비어 있으면(진도가 여는 스테이지·일정 잠정) 시작된 것이다 */
export function windowStarted(win: StageWindow, now: Date): boolean {
  return win.opensAt === null || win.opensAt.getTime() <= now.getTime();
}

/**
 * 제출 판 한 행의 열림·잠금 — 실제 창·진도·제출 상태를 합친다. submission-store가
 * DB에서 재료를 읽어 이것 하나로 판정한다.
 *
 * 잠금 사유는 이 순서로 하나만 낸다(앞이 뒤를 덮는다).
 *   STAGE_LOCKED    이 제출의 판정이 끝나 잠겼다
 *   STAGE_CLOSED    실제 마감이 지났다. 보완 재제출 기한이 남았으면 예외
 *   STAGE_LOCKED    이 창을 닫는 게이트의 판정이 끝났다(`gateSettled`)
 *   STAGE_NOT_OPEN  달력이 여는 스테이지(첫·마지막)의 시작 전
 *
 * ⚠️ 게이트 판정이 끝나면 그 게이트가 덮는 앞 스테이지도 잠근다. 유동 게이트로 s1이
 * 1차 심사 마감까지 열려 있어서, 마감 전에 1차 판정이 나면 판정의 근거(s1 고도화
 * 문서 10종)를 판정 뒤에 고칠 수 있게 된다. 옛 달력에서는 s1이 s2보다 먼저 닫혀
 * 이런 일이 없었다. 마감이 이미 지났으면 「마감」이 먼저다.
 * 게이트를 **제출**한 때가 아니라 판정이 끝난 때 잠그는 것은 내가 정함(수연 확인
 * 대기) — 게이트 자신도 판정 전까지는 재제출이 열려 있어 거기에 맞췄다.
 *
 * `open`은 「예정」이 아닌가다. 마감이 지난 판은 진도로 못 닿았어도 앞으로 열릴 일이
 * 없어 「예정」이라 부르지 않는다 — 부르면 머리의 「마감 10.11」·버튼 「마감됨」과
 * 반대 말을 한다.
 *
 * ⚠️ `prevSubmitted` — 바로 앞 스테이지가 게이트가 아니면 **그 제출이 있어야** 열린다
 * (「제출하면 바로 다음 단계가 열린다」). 진도만으로는 모자란 자리가 s4다: 1차를
 * 통과하면 진도가 s3이 되고(스키마 EntryStage 주석), s3을 내도 s3 그대로라 진도로는
 * s3을 냈는지 모른다. 옛 달력에서는 s4가 11.02에 모두에게 열려 이 차이가 가려졌다.
 * 진도로 닿았는데 앞 제출이 없으면 「아직 안 열림」으로 잠근다 — `canSubmitStage`는
 * 진도만 보므로 문구는 이쪽이 낸다. (2026-09-26 화면 확인 중 발견)
 */
export function stageRowState(input: {
  win: StageWindow;
  now: Date;
  /** 지금 보는 제출(s4는 이번 주차). 없으면 null */
  current: { status: SubmissionStatus; revisionDueAt: Date | null } | null;
  /** 진도로 닿는가 — access-policy `stageReachable` */
  reachable: boolean;
  /**
   * 이 창을 닫는 게이트의 판정이 끝났는가 — 그 게이트 제출이 잠겼거나 진도가 그
   * 게이트를 넘었다(access-policy `passedGate`). 게이트 자신의 행이면 false
   */
  gateSettled: boolean;
  /** 바로 앞 스테이지가 게이트가 아니면 그 제출(임시저장 제외)이 있는가. 해당 없으면 true */
  prevSubmitted: boolean;
}): { open: boolean; lockedReason: SubmissionFailureCode | null } {
  const { win, now, current } = input;
  const at = now.getTime();
  const closed =
    win.closesAt !== null &&
    win.closesAt.getTime() <= at &&
    !(current?.revisionDueAt && current.revisionDueAt.getTime() > at);
  const started = windowStarted(win, now);
  const lockedReason: SubmissionFailureCode | null =
    current?.status === SubmissionStatus.locked
      ? "STAGE_LOCKED"
      : closed
        ? "STAGE_CLOSED"
        : input.gateSettled
          ? "STAGE_LOCKED"
          : !started
            ? "STAGE_NOT_OPEN"
            : input.reachable && !input.prevSubmitted
              ? "STAGE_NOT_OPEN"
              : null;
  const reached = input.reachable && input.prevSubmitted;
  return { open: started && (reached || closed), lockedReason };
}

/**
 * 참가자에게 보이는 일정 — 달력 행에 **실제 창**을 입힌다(유동 게이트, 2026-09-25
 * 수연 지시). 참가자 헤더(header-read → header-state `resolveDashboardHeader`)가
 * 이것으로 D1 「s1 마감」·D2 작업 중 스테이지 마감·D4(s5 창)를 판정한다 — 헤더가
 * 달력 마감(10.04)을 세는데 제출 화면은 10.11까지 열려 있으면 둘 중 하나는 틀린
 * 말이 된다. 운영자 헤더는 달력(시즌 권장 일정)을 그대로 받는다.
 *
 * s4는 주간 반복이라 그 주차의 끝을 마감으로 둔다(`weekDue`, 제출 화면 「이번 주
 * 마감」과 같은 값). 주차는 달력 시작일로 센다.
 *
 * header-state.ts가 아니라 여기 두는 이유 — 그 파일은 공개 헤더(NavBar·랜딩,
 * 클라이언트)도 읽어서, 이 파일(zod 스키마)을 끌어가면 모든 화면 번들이 무거워진다.
 */
export function participantStages<
  T extends { key: StageKey; isGate: boolean; opensAt: Date | null; closesAt: Date | null },
>(stages: readonly T[], now: Date): T[] {
  const windows = stageWindows(
    stages.map((s) => ({
      stageKey: s.key,
      isGate: s.isGate,
      opensAt: s.opensAt,
      closesAt: s.closesAt,
    })),
  );
  return stages.map((s) => {
    const win = windows[s.key];
    if (!win) return s;
    const closesAt =
      s.key === StageKey.s4
        ? weekDue(s.opensAt, currentWeek(s.opensAt, now), win.closesAt)
        : win.closesAt;
    return { ...s, opensAt: win.opensAt, closesAt };
  });
}

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

  「안 열림」은 달력이 아니라 `state.open`이다(유동 게이트) — 앞 단계를 내기 전이면
  달력상 그 주여도 「예정」이고, 앞 단계를 내면 달력보다 먼저 꼬리가 사라진다.
*/
export function tabTail(state: StageState): Tail | null {
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
  if (!state.open) return { kind: "chip", label: "예정" };
  return null;
}

/*
  머리 배지 — 시안 `.frm-hd .badge`. 탭과 달리 DB 값 그대로다(submitted·pass·draft).
  s4만 「2주차 작성 중」처럼 주차를 붙인다. 「예정」은 탭과 같이 `state.open`으로 본다.
*/
export function paneBadge(
  state: StageState,
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
  if (!state.open) return { tone: "gray", label: "예정" };
  return null;
}

const DAY_MS = 86_400_000;

/*
  마감·시각 표기(`formatDeadline`·`formatMoment`·`formatDay`)는 kst-format.ts로
  옮겼다(2026-09-26). 표기만 필요한 쪽(team.ts)이 이 파일을 끌어오면 클라이언트
  번들에 제출 스키마와 콘텐츠가 따라갈 수 있어서다.
*/

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

/**
 * s4 「이번 주 마감」 — 그 주차의 끝, 스테이지 실제 마감을 넘지 않게.
 *
 * 유동 게이트로 s4의 실제 마감이 s5 마감까지 늘었지만(`stageWindows`) 주간 제출은
 * 그 주가 끝나면 다음 주차 행으로 넘어가므로, 이번 주 것을 낼 수 있는 끝은 주차
 * 끝이다. 제출 화면과 참가자 헤더가 같은 값을 쓴다 — 내가 정함(수연 확인 대기).
 */
export function weekDue(
  opensAt: Date | null,
  week: number,
  closesAt: Date | null,
): Date | null {
  const { to } = weekRange(opensAt, week);
  if (!to) return closesAt;
  if (!closesAt) return to;
  return to.getTime() < closesAt.getTime() ? to : closesAt;
}

/**
 * s2 방문 기간 표기 — 시안 「10.05~10.10 유효 방문」의 앞부분.
 *
 * 앞은 **첫 집계일**이다. 유동 게이트에서는 s2 달력 시작일보다 먼저 랜딩을
 * 올릴 수 있고, 그 방문도 합에 든다(제출 화면이 측정 시작부터 센다).
 * 뒤는 오늘과 마감일 중 이른 날 — 합이 거기까지를 셌다. 시안(10.10 제출 판,
 * 마감 10.11)도 그 모양이다. 집계가 없으면 빈 문자열(화면이 「유효 방문」만 적는다).
 * 뒤를 「오늘과 마감일 중 이른 날」로 둔 것은 내가 정함(수연 확인 대기).
 */
export function visitRange(
  firstDate: Date | null,
  closesAt: Date | null,
  now: Date,
): string {
  if (!firstDate) return "";
  /* 자정 마감은 전날이 마지막 날이다(`formatDeadline`과 같은 이유) */
  const last = closesAt ? new Date(closesAt.getTime() - 60_000) : now;
  const end = last.getTime() < now.getTime() ? last : now;
  /* 시계가 첫 집계일보다 앞서 있으면(개발 시계) 거꾸로 적지 않는다 */
  const endDay = seoulDateOnly(end);
  return `${formatDay(firstDate)}~${formatDay(endDay < firstDate ? firstDate : end)}`;
}

/** 전환율 — 시안 `5.1%`. 방문이 없으면 null */
export function conversionRate(leads: number, visitors: number): string | null {
  if (visitors <= 0) return null;
  return `${((leads / visitors) * 100).toFixed(1)}%`;
}
