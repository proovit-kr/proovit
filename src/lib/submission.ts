import { z } from "zod";

import { StageKey } from "@/generated/prisma/enums";

/*
  제출의 **순수** 절반 — 길이·형식 규칙. 화면(클라이언트)도 이 파일을 읽는다.
  저장은 submission-store.ts에 있다. apply.ts / apply-store.ts와 같은 형태다.

  근거는 **PLN6 필드 정의서 v0.1(8/13) 3장·4장**이다. 3장이 전 스테이지 공통,
  4장이 스테이지별이다. 이 파일의 필드 이름·필수 여부·글자수는 그 표를 옮긴 것이고,
  표에 없는 칸을 여기서 만들지 않는다.
*/

/** 단발 제출은 week=0. s4만 주차를 센다(PLN6 0장) */
export const SINGLE_WEEK = 0;

export const CONCEPT_MAX = 200;
export const CORE_FEATURE_MAX = 100;
export const NOT_BUILDING_MAX = 100;
export const RISKIEST_MAX = 200;
export const PROBLEM_DOC_MAX = 5000;
export const MEMO_MAX = 1000;

/** 「이번 시즌에 안 만들 것」은 2개다 — PLN6 4장 s1 `text[] 2개` */
export const NOT_BUILDING_COUNT = 2;

export function isStageKey(value: string): value is StageKey {
  return (Object.values(StageKey) as string[]).includes(value);
}

/*
  s1 제출 필드.

  「문제 정의 1페이지」는 PLN6이 **text 또는 파일, 둘 중 하나는 반드시**로 정했다.
  ⚠️ 파일 업로드는 아직 못 만든다 — 증빙 저장소(R2)가 붙어 있지 않다. 그래서 지금은
  본문 텍스트만 받고 필수로 둔다. R2가 붙으면 `evidence_urls`를 대안으로 열고
  이 필수를 「둘 중 하나」로 완화한다. 그때 고칠 자리는 이 스키마 한 곳이다.
*/
export const S1Schema = z.object({
  concept: z
    .string()
    .trim()
    .min(1, "한마디 컨셉을 적어 주세요.")
    .max(CONCEPT_MAX, `${CONCEPT_MAX}자까지 쓸 수 있어요.`),
  problemDoc: z
    .string()
    .trim()
    .min(1, "문제 정의 1페이지를 붙여넣어 주세요.")
    .max(PROBLEM_DOC_MAX, `${PROBLEM_DOC_MAX}자까지 쓸 수 있어요.`),
  coreFeature: z
    .string()
    .trim()
    .min(1, "핵심 기능 한 개를 적어 주세요.")
    .max(CORE_FEATURE_MAX, `${CORE_FEATURE_MAX}자까지 쓸 수 있어요.`),
  /* 두 칸 모두 채워야 한다 — 「안 만들 것」을 하나만 적으면 범위가 안 좁혀진다 */
  notBuilding: z
    .array(
      z
        .string()
        .trim()
        .min(1, "안 만들 것 두 개를 모두 적어 주세요.")
        .max(NOT_BUILDING_MAX, `${NOT_BUILDING_MAX}자까지 쓸 수 있어요.`),
    )
    .length(NOT_BUILDING_COUNT),
  riskiest: z
    .string()
    .trim()
    .min(1, "가장 위험한 가정을 적어 주세요.")
    .max(RISKIEST_MAX, `${RISKIEST_MAX}자까지 쓸 수 있어요.`),
  /* 가이드 완료 체크 — 대시보드 스텝 체크리스트와 1:1(PLN6 3장) */
  guideChecks: z.array(z.boolean()),
  /** 심사에 반영하지 않는다(PLN6 3장) */
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export type S1Payload = z.infer<typeof S1Schema>;

/*
  임시 저장용.

  ⚠️ `S1Schema.partial()`로는 안 된다 — partial은 「칸이 없어도 된다」로 바꿔줄 뿐,
  빈 문자열은 **있는 값**이라 `min(1)`에 걸린다. 절반 쓴 폼이 저장되지 않는다
  (8/14에 그렇게 짰다가 잡았다). 임시 저장이 지키는 것은 상한 하나다 —
  payload가 무한히 커지는 것만 막고, 비어 있는 것은 그대로 받는다.
*/
export const S1DraftSchema = z.object({
  concept: z.string().trim().max(CONCEPT_MAX, `${CONCEPT_MAX}자까지 쓸 수 있어요.`),
  problemDoc: z
    .string()
    .trim()
    .max(PROBLEM_DOC_MAX, `${PROBLEM_DOC_MAX}자까지 쓸 수 있어요.`),
  coreFeature: z
    .string()
    .trim()
    .max(CORE_FEATURE_MAX, `${CORE_FEATURE_MAX}자까지 쓸 수 있어요.`),
  notBuilding: z.array(
    z.string().trim().max(NOT_BUILDING_MAX, `${NOT_BUILDING_MAX}자까지 쓸 수 있어요.`),
  ),
  riskiest: z.string().trim().max(RISKIEST_MAX, `${RISKIEST_MAX}자까지 쓸 수 있어요.`),
  guideChecks: z.array(z.boolean()),
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

// ── s3 — AI 빌드·배포 (PLN6 4장) ─────────────────────────────

export const BUILDER_OTHER_MAX = 60;
export const LAUNCH_CHECK_COUNT = 10;
export const AI_CHECK_COUNT = 5;

/*
  서비스 주소.

  `https://`만 받는다 — 배포된 서비스를 심사위원과 상호 테스터가 그대로 열고,
  참가작이 개인정보를 받는 이상 평문 http는 체크리스트 A8(전 구간 HTTPS)과
  어긋난다. 주소 자체의 소유 확인은 여기서 하지 않는다(그건 「측정 연동」이다).
*/
export const ServiceUrlSchema = z
  .string()
  .trim()
  .min(1, "배포한 서비스 주소를 적어 주세요.")
  .max(500)
  .refine(
    (value) => value.startsWith("https://"),
    "https:// 로 시작하는 주소여야 해요.",
  );

export const S3Schema = z.object({
  serviceUrl: ServiceUrlSchema,
  builder: z.string().trim().min(1, "무엇으로 만들었는지 골라 주세요."),
  /* 「그 외」를 골랐을 때만 쓴다. 아래 superRefine이 짝을 본다 */
  builderOther: z.string().trim().max(BUILDER_OTHER_MAX).optional(),
  signupConnected: z.boolean(),
  /** 수익화(결제형)일 때만 묻는다 — PLN6 「수익화 시」 */
  paymentReturnRegistered: z.boolean().optional(),
  launchChecks: z.array(z.boolean()).length(LAUNCH_CHECK_COUNT),
  /** 생성형 AI 기능을 제공하는가(체크리스트 B0) */
  aiFeature: z.boolean(),
  aiChecks: z.array(z.boolean()).length(AI_CHECK_COUNT),
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export const S3DraftSchema = z.object({
  serviceUrl: z.string().trim().max(500),
  builder: z.string().trim(),
  builderOther: z.string().trim().max(BUILDER_OTHER_MAX).optional(),
  signupConnected: z.boolean(),
  paymentReturnRegistered: z.boolean().optional(),
  launchChecks: z.array(z.boolean()),
  aiFeature: z.boolean(),
  aiChecks: z.array(z.boolean()),
  memo: z.string().trim().max(MEMO_MAX).optional(),
});

export type S3Payload = z.infer<typeof S3Schema>;

/**
 * 제출 가능한가 — s3의 「전부 채웠는가」 판정.
 *
 * 스키마로는 못 잡는 두 가지를 본다. 체크박스는 타입이 boolean이라 **전부 false여도
 * 스키마를 통과하고**, 「그 외」 빌더는 이름 칸과 짝이어야 한다.
 * 화면과 서버가 같은 함수를 부른다 — 버튼을 잠그는 조건과 거절하는 조건이 갈리면
 * "왜 안 되는지"를 설명할 수 없다.
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
  /* AI 기능이 없으면 PART B는 해당 없음이다(체크리스트 B0) */
  if (value.aiFeature && !value.aiChecks.every(Boolean)) return "AI_INCOMPLETE";
  return null;
}

export type SubmissionFieldErrors = Partial<
  Record<keyof S1Payload | keyof S3Payload | "chargeType", string[]>
>;

/**
 * 임시 저장인가 제출인가.
 *
 * 임시 저장은 **검증을 통과하지 않아도 된다** — 쓰다 만 것을 잡아두는 것이 목적이다.
 * 제출은 전부 채워야 한다. 같은 폼에서 버튼만 다르다.
 */
export type SubmitIntent = "draft" | "submit";

/** 화면이 구분해서 안내해야 하는 실패 */
export type SubmissionFailureCode =
  | "STAGE_CLOSED"
  | "STAGE_LOCKED"
  | "CHARGE_TYPE_LOCKED"
  | "GUIDE_INCOMPLETE"
  | "BUILDER_NAME"
  | "LAUNCH_INCOMPLETE"
  | "AI_INCOMPLETE"
  | "NOT_FOUND";

export const SUBMISSION_FAILURE_MESSAGE: Record<
  SubmissionFailureCode,
  string
> = {
  STAGE_CLOSED: "제출 마감이 지났어요.",
  STAGE_LOCKED: "심사가 시작돼 더 고칠 수 없어요.",
  CHARGE_TYPE_LOCKED: "과금 유형은 첫 제출 뒤에 바꿀 수 없어요.",
  GUIDE_INCOMPLETE: "가이드 완료 체크를 모두 확인해 주세요.",
  BUILDER_NAME: "무엇으로 만들었는지 이름을 적어 주세요.",
  LAUNCH_INCOMPLETE:
    "출시 전 점검을 모두 확인해 주세요. 미충족 항목이 있으면 고친 뒤 배포하는 것이 규칙입니다(운영규칙 제22조).",
  AI_INCOMPLETE: "AI 표시 점검을 모두 확인해 주세요.",
  NOT_FOUND: "이 스테이지를 찾을 수 없어요.",
};
