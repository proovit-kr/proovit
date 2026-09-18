"use server";

import { revalidatePath } from "next/cache";

import { AI_CHECKS, LAUNCH_CHECKS, S1_GUIDE_CHECKS } from "@/content/submission";
import { ChargeType, EntryStage, StageKey } from "@/generated/prisma/enums";
import { canSubmitStage, loadViewerState, toAccessContext } from "@/lib/access";
import {
  NOT_BUILDING_COUNT,
  S1DraftSchema,
  S1Schema,
  S3DraftSchema,
  S3Schema,
  SUBMISSION_FAILURE_MESSAGE,
  s3Missing,
  type SubmissionFieldErrors,
  type SubmitIntent,
} from "@/lib/submission";
import { saveS1, saveS3 } from "@/lib/submission-store";

import {
  S2DraftSchema,
  S2Schema,
  S2_GUIDE_CHECKS,
  S4DraftSchema,
  S4Schema,
  S4_GUIDE_CHECKS,
  S5DraftSchema,
  S5Schema,
  S5_GUIDE_CHECKS,
  guideIncomplete,
} from "./stages";
import { saveStagePayload } from "./stage-store";

/*
  s1 제출.

  ⚠️ 판정은 `canSubmitStage()`가 한다 — 화면이 폼을 그릴 때 부르는 것과 같은 함수다.
  팀장 여부·진도·페이즈·실격이 전부 그 하나에 있다(CLAUDE.md §3).

  ⚠️ 임시 저장과 제출을 한 액션이 받는다. 다른 것은 검증의 세기뿐이다 —
  임시 저장은 쓰다 만 것을 잡아두는 것이 목적이라 필수 검증을 걸지 않는다.
  액션을 둘로 나누면 두 곳에서 판정을 각각 해야 한다.
*/

export type SubmitState = {
  errors?: SubmissionFieldErrors;
  message?: string;
  done?: "draft" | "submitted";
  /** 되돌려 채울 입력값. 없으면 방금 쓴 것을 잃는다 */
  values?: Record<string, string>;
};

export async function saveStage1(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const intent: SubmitIntent =
    String(formData.get("intent") ?? "") === "submit" ? "submit" : "draft";

  const text = (key: string) => String(formData.get(key) ?? "");
  const values: Record<string, string> = {
    concept: text("concept"),
    problemDoc: text("problemDoc"),
    coreFeature: text("coreFeature"),
    riskiest: text("riskiest"),
    memo: text("memo"),
    chargeType: text("chargeType"),
  };
  for (let i = 0; i < NOT_BUILDING_COUNT; i += 1) {
    values[`notBuilding${i}`] = text(`notBuilding${i}`);
  }

  const viewer = await loadViewerState();
  if (!viewer.user) {
    return { message: "로그인이 풀렸습니다. 다시 로그인해 주세요.", values };
  }
  if (!viewer.entry || !viewer.season) {
    return { message: "참가 기록이 없습니다.", values };
  }

  const permission = canSubmitStage(EntryStage.s1, toAccessContext(viewer));
  if (!permission.ok) return { message: permission.message, values };

  const raw = {
    concept: values.concept,
    problemDoc: values.problemDoc,
    coreFeature: values.coreFeature,
    notBuilding: Array.from(
      { length: NOT_BUILDING_COUNT },
      (_, i) => values[`notBuilding${i}`] ?? "",
    ),
    riskiest: values.riskiest,
    /* 체크는 항목 수만큼 온다. 순서가 곧 뜻이라 개수를 고정해 읽는다 */
    guideChecks: S1_GUIDE_CHECKS.map(
      (_, i) => formData.get(`guide${i}`) === "on",
    ),
    memo: values.memo,
  };

  const chargeType =
    values.chargeType === ChargeType.inquiry
      ? ChargeType.inquiry
      : ChargeType.payment;

  /*
    임시 저장은 필수 검증을 건너뛰고 **상한만** 본다(S1DraftSchema 주석).
    쓰다 만 것을 잡아두는 것이 목적이라 빈 칸은 그대로 받는다.
  */
  if (intent === "draft") {
    const trimmed = S1DraftSchema.safeParse(raw);
    if (!trimmed.success) {
      return {
        errors: flatten(trimmed.error),
        message: "글자수를 넘긴 칸이 있어요.",
        values,
      };
    }
    const saved = await saveS1({
      entryId: viewer.entry.id,
      seasonId: viewer.season.id,
      userId: viewer.user.id,
      payload: trimmed.data,
      chargeType,
      intent,
    });
    if (!saved.ok) {
      return { message: SUBMISSION_FAILURE_MESSAGE[saved.code], values };
    }
    revalidatePath("/dashboard/submit/s1");
    return { done: "draft", values };
  }

  const parsed = S1Schema.safeParse(raw);
  if (!parsed.success) {
    return { errors: flatten(parsed.error), values };
  }
  /*
    가이드 완료 체크는 PLN6 3장에서 필수다. 스키마에 boolean[]로만 두면 전부
    false여도 통과하므로 여기서 본다 — 화면도 같은 조건으로 안내한다.
  */
  if (!parsed.data.guideChecks.every(Boolean)) {
    return { message: SUBMISSION_FAILURE_MESSAGE.GUIDE_INCOMPLETE, values };
  }

  const saved = await saveS1({
    entryId: viewer.entry.id,
    seasonId: viewer.season.id,
    userId: viewer.user.id,
    payload: parsed.data,
    chargeType,
    intent,
  });
  if (!saved.ok) {
    return { message: SUBMISSION_FAILURE_MESSAGE[saved.code], values };
  }

  /* 제출은 대시보드의 결론(nextAction)을 바꾼다 — 허브도 다시 그린다 */
  revalidatePath("/dashboard/submit/s1");
  revalidatePath("/dashboard");
  return { done: "submitted", values };
}

function flatten(error: {
  issues: { path: (string | number | symbol)[]; message: string }[];
}): SubmissionFieldErrors {
  const out: SubmissionFieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "") as keyof SubmissionFieldErrors;
    if (!key) continue;
    out[key] = [...(out[key] ?? []), issue.message];
  }
  return out;
}

/*
  s3 제출 — AI 빌드·배포.

  s1과 나눈 이유는 필드가 겹치지 않기 때문이다. 한 액션이 스테이지를 분기하면
  "이 칸이 어느 스테이지 것인지"를 매번 되짚어야 한다.
*/
export async function saveStage3(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const intent: SubmitIntent =
    String(formData.get("intent") ?? "") === "submit" ? "submit" : "draft";

  const text = (key: string) => String(formData.get(key) ?? "");
  const values: Record<string, string> = {
    serviceUrl: text("serviceUrl"),
    builder: text("builder"),
    builderOther: text("builderOther"),
    memo: text("memo"),
  };

  const viewer = await loadViewerState();
  if (!viewer.user) {
    return { message: "로그인이 풀렸습니다. 다시 로그인해 주세요.", values };
  }
  if (!viewer.entry || !viewer.season) {
    return { message: "참가 기록이 없습니다.", values };
  }

  const permission = canSubmitStage(EntryStage.s3, toAccessContext(viewer));
  if (!permission.ok) return { message: permission.message, values };

  const raw = {
    serviceUrl: values.serviceUrl,
    builder: values.builder,
    builderOther: values.builderOther,
    signupConnected: formData.get("signupConnected") === "on",
    paymentReturnRegistered: formData.get("paymentReturn") === "on",
    /* 순서가 곧 뜻이라 개수를 고정해 읽는다 — 체크리스트 항목과 1:1 */
    launchChecks: LAUNCH_CHECKS.map(
      (_, i) => formData.get(`launch${i}`) === "on",
    ),
    aiFeature: formData.get("aiFeature") === "on",
    aiChecks: AI_CHECKS.map((_, i) => formData.get(`ai${i}`) === "on"),
    memo: values.memo,
  };

  if (intent === "draft") {
    const trimmed = S3DraftSchema.safeParse(raw);
    if (!trimmed.success) {
      return {
        errors: flatten(trimmed.error),
        message: "글자수를 넘긴 칸이 있어요.",
        values,
      };
    }
    const saved = await saveS3({
      entryId: viewer.entry.id,
      seasonId: viewer.season.id,
      userId: viewer.user.id,
      payload: trimmed.data,
      intent,
    });
    if (!saved.ok) {
      return { message: SUBMISSION_FAILURE_MESSAGE[saved.code], values };
    }
    revalidatePath("/dashboard/submit/s3");
    return { done: "draft", values };
  }

  const parsed = S3Schema.safeParse(raw);
  if (!parsed.success) {
    return { errors: flatten(parsed.error), values };
  }
  /*
    체크박스는 타입이 boolean이라 전부 false여도 스키마를 통과한다.
    화면이 버튼을 잠글 때 쓰는 것과 **같은 함수**로 본다.
  */
  const missing = s3Missing(parsed.data);
  if (missing) {
    return { message: SUBMISSION_FAILURE_MESSAGE[missing], values };
  }

  const saved = await saveS3({
    entryId: viewer.entry.id,
    seasonId: viewer.season.id,
    userId: viewer.user.id,
    payload: parsed.data,
    intent,
  });
  if (!saved.ok) {
    return { message: SUBMISSION_FAILURE_MESSAGE[saved.code], values };
  }

  revalidatePath("/dashboard/submit/s3");
  revalidatePath("/dashboard");
  return { done: "submitted", values };
}

// ── s2 · s4 · s5 ─────────────────────────────────────────────

/*
  셋의 액션이 s1·s3과 다른 것은 두 가지뿐이다.

  1. **지표를 받지 않는다.** 시안이 읽기 전용으로 그린 칸(s2 방문자·사전 신청자,
     s4 주간 방문·가입, s5 최종 지표)은 폼에 없으므로 여기서 읽을 것도 없다.
     참가자가 숫자를 입력하지 않는다는 약속이 이 자리에서 지켜진다.
  2. **s4는 주차가 붙는다.** 같은 스테이지를 매주 내므로 `week`이 행을 가른다.

  나머지 뼈대(임시 저장은 상한만, 제출은 전부 검증, 판정은 `canSubmitStage`)는
  위의 s1·s3과 같다.
*/

function readChannels(formData: FormData): string[] {
  /* 태그 입력은 같은 이름으로 여러 개 온다. 빈 값은 떨군다 */
  return formData
    .getAll("channels")
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function readChecks(formData: FormData, count: number): boolean[] {
  return Array.from({ length: count }, (_, i) => formData.get(`guide${i}`) === "on");
}

type StageContext =
  | { error: SubmitState; viewer?: undefined }
  | {
      error?: undefined;
      viewer: { userId: string; entryId: string; seasonId: string };
    };

async function stageContext(
  values: Record<string, string>,
  stage: EntryStage,
): Promise<StageContext> {
  const viewer = await loadViewerState();
  if (!viewer.user) {
    return { error: { message: "로그인이 풀렸습니다. 다시 로그인해 주세요.", values } };
  }
  if (!viewer.entry || !viewer.season) {
    return { error: { message: "참가 기록이 없습니다.", values } };
  }
  const permission = canSubmitStage(stage, toAccessContext(viewer));
  if (!permission.ok) {
    return { error: { message: permission.message, values } };
  }
  return {
    viewer: {
      userId: viewer.user.id,
      entryId: viewer.entry.id,
      seasonId: viewer.season.id,
    },
  };
}

export async function saveStage2(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const intent: SubmitIntent =
    String(formData.get("intent") ?? "") === "submit" ? "submit" : "draft";
  const text = (key: string) => String(formData.get(key) ?? "");
  const values: Record<string, string> = {
    landingUrl: text("landingUrl"),
    postUrl: text("postUrl"),
    memo: text("memo"),
  };

  const ctx = await stageContext(values, EntryStage.s2);
  if (ctx.error) return ctx.error;

  const raw = {
    landingUrl: values.landingUrl,
    channels: readChannels(formData),
    postUrl: values.postUrl,
    guideChecks: readChecks(formData, S2_GUIDE_CHECKS.length),
    memo: values.memo,
  };

  const schema = intent === "draft" ? S2DraftSchema : S2Schema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      errors: flatten(parsed.error) as SubmitState["errors"],
      message: intent === "draft" ? "글자수를 넘긴 칸이 있어요." : undefined,
      values,
    };
  }
  if (intent === "submit" && guideIncomplete(raw.guideChecks, S2_GUIDE_CHECKS.length)) {
    return { message: SUBMISSION_FAILURE_MESSAGE.GUIDE_INCOMPLETE, values };
  }

  const saved = await saveStagePayload({
    ...ctx.viewer,
    stageKey: StageKey.s2,
    payload: parsed.data,
    intent,
  });
  if (!saved.ok) return { message: SUBMISSION_FAILURE_MESSAGE[saved.code], values };

  revalidatePath("/dashboard/submit/s2");
  revalidatePath("/dashboard");
  return { done: intent === "draft" ? "draft" : "submitted", values };
}

export async function saveStage4(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const intent: SubmitIntent =
    String(formData.get("intent") ?? "") === "submit" ? "submit" : "draft";
  const text = (key: string) => String(formData.get(key) ?? "");
  const values: Record<string, string> = {
    activity: text("activity"),
    improved: text("improved"),
    memo: text("memo"),
  };
  /* 주차는 화면이 아니라 시스템이 정한다. 폼은 계산된 값을 그대로 돌려준다 */
  const week = Number(formData.get("week") ?? 1) || 1;

  const ctx = await stageContext(values, EntryStage.s4);
  if (ctx.error) return ctx.error;

  const raw = {
    activity: values.activity,
    channels: readChannels(formData),
    improved: values.improved,
    guideChecks: readChecks(formData, S4_GUIDE_CHECKS.length),
    memo: values.memo,
  };

  const schema = intent === "draft" ? S4DraftSchema : S4Schema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      errors: flatten(parsed.error) as SubmitState["errors"],
      message: intent === "draft" ? "글자수를 넘긴 칸이 있어요." : undefined,
      values,
    };
  }
  if (intent === "submit" && guideIncomplete(raw.guideChecks, S4_GUIDE_CHECKS.length)) {
    return { message: SUBMISSION_FAILURE_MESSAGE.GUIDE_INCOMPLETE, values };
  }

  const saved = await saveStagePayload({
    ...ctx.viewer,
    stageKey: StageKey.s4,
    payload: parsed.data,
    intent,
    week,
  });
  if (!saved.ok) return { message: SUBMISSION_FAILURE_MESSAGE[saved.code], values };

  revalidatePath("/dashboard/submit/s4");
  revalidatePath("/dashboard");
  return { done: intent === "draft" ? "draft" : "submitted", values };
}

export async function saveStage5(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const intent: SubmitIntent =
    String(formData.get("intent") ?? "") === "submit" ? "submit" : "draft";
  const text = (key: string) => String(formData.get(key) ?? "");
  const values: Record<string, string> = {
    retro: text("retro"),
    memo: text("memo"),
  };

  const ctx = await stageContext(values, EntryStage.s5);
  if (ctx.error) return ctx.error;

  const raw = {
    monetized: formData.get("monetized") === "on",
    paymentConnected: formData.get("paymentConnected") === "on",
    retro: values.retro,
    guideChecks: readChecks(formData, S5_GUIDE_CHECKS.length),
    archiveConsent: formData.get("archiveConsent") === "on",
    memo: values.memo,
  };

  const schema = intent === "draft" ? S5DraftSchema : S5Schema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      errors: flatten(parsed.error) as SubmitState["errors"],
      message: intent === "draft" ? "글자수를 넘긴 칸이 있어요." : undefined,
      values,
    };
  }
  if (intent === "submit" && guideIncomplete(raw.guideChecks, S5_GUIDE_CHECKS.length)) {
    return { message: SUBMISSION_FAILURE_MESSAGE.GUIDE_INCOMPLETE, values };
  }

  const saved = await saveStagePayload({
    ...ctx.viewer,
    stageKey: StageKey.s5,
    payload: parsed.data,
    intent,
  });
  if (!saved.ok) return { message: SUBMISSION_FAILURE_MESSAGE[saved.code], values };

  revalidatePath("/dashboard/submit/s5");
  revalidatePath("/dashboard");
  return { done: intent === "draft" ? "draft" : "submitted", values };
}
