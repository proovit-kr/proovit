"use server";

import { revalidatePath } from "next/cache";

import { AI_CHECKS, LAUNCH_CHECKS, S1_GUIDE_CHECKS } from "@/content/submission";
import { ChargeType, EntryStage } from "@/generated/prisma/enums";
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
