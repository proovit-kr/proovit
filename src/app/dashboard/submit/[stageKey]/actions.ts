"use server";

import { revalidatePath } from "next/cache";

import { GUIDE_CHECKS } from "@/content/submission";
import { ChargeType, EntryStage, StageKey } from "@/generated/prisma/enums";
import { canSubmitStage, loadViewerState, toAccessContext } from "@/lib/access";
import type { Prisma } from "@/generated/prisma/client";
import {
  S1DraftSchema,
  S1Schema,
  S2DraftSchema,
  S2Schema,
  S3DraftSchema,
  S3Schema,
  S4DraftSchema,
  S4Schema,
  S5DraftSchema,
  S5Schema,
  SUBMISSION_FAILURE_MESSAGE,
  guideIncomplete,
  isStageKey,
  s3Missing,
  type SubmissionFieldErrors,
  type SubmitIntent,
} from "@/lib/submission";
import { echoValues, readForm } from "@/lib/submission-fields";
import { saveStage } from "@/lib/submission-store";

/*
  스테이지 제출 — 다섯 판이 한 액션을 쓴다. 갈리는 것은 스키마와 「전부
  채웠는가」 판정뿐이고, 뼈대(권한 → 임시 저장은 상한만 → 제출은 전부 → 저장)는
  같다. 다섯으로 나누면 판정이 다섯 곳에 흩어진다.

  ⚠️ 판정은 `canSubmitStage()`가 한다 — 화면이 폼을 그릴 때 부르는 것과 같은
  함수다. 팀장 여부·진도·게이트 대기가 전부 그 하나에 있다(CLAUDE.md §3).

  ⚠️ 임시 저장과 제출을 한 액션이 받는다. 다른 것은 검증의 세기뿐이다 —
  임시 저장은 쓰다 만 것을 잡아두는 것이 목적이라 필수 검증을 걸지 않는다.
*/

export type SubmitState = {
  errors?: SubmissionFieldErrors;
  message?: string;
  done?: "draft" | "submitted";
  /** 되돌려 채울 입력값. 없으면 방금 쓴 것을 잃는다 */
  values?: Record<string, string>;
  channels?: string[];
};

const SCHEMAS = {
  s1: { draft: S1DraftSchema, submit: S1Schema },
  s2: { draft: S2DraftSchema, submit: S2Schema },
  s3: { draft: S3DraftSchema, submit: S3Schema },
  s4: { draft: S4DraftSchema, submit: S4Schema },
  s5: { draft: S5DraftSchema, submit: S5Schema },
} as const;

export async function saveStageAction(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const stageKey = String(formData.get("stageKey") ?? "");
  const { values, channels } = echoValues(formData);
  const echo = { values, channels };
  if (!isStageKey(stageKey)) {
    return { message: SUBMISSION_FAILURE_MESSAGE.NOT_FOUND, ...echo };
  }
  const intent: SubmitIntent =
    String(formData.get("intent") ?? "") === "submit" ? "submit" : "draft";

  const viewer = await loadViewerState();
  if (!viewer.user) {
    return { message: "로그인이 풀렸습니다. 다시 로그인해 주세요.", ...echo };
  }
  if (!viewer.entry || !viewer.season) {
    return { message: "참가 기록이 없습니다.", ...echo };
  }
  /* EntryStage와 StageKey는 s1~s5에서 값이 같다 */
  const permission = canSubmitStage(
    stageKey as unknown as EntryStage,
    toAccessContext(viewer),
  );
  if (!permission.ok) return { message: permission.message, ...echo };

  const raw = readForm(stageKey, formData);
  const parsed = SCHEMAS[stageKey][intent].safeParse(raw);
  if (!parsed.success) {
    return {
      errors: flatten(parsed.error),
      message: intent === "draft" ? "글자수를 넘긴 칸이 있어요." : undefined,
      ...echo,
    };
  }

  if (intent === "submit") {
    /*
      체크박스는 타입이 boolean이라 전부 false여도 스키마를 통과한다.
      화면이 버튼을 잠글 때 쓰는 것과 **같은 함수**로 본다.
    */
    const guide = raw.guideChecks as boolean[];
    if (guideIncomplete(guide, GUIDE_CHECKS[stageKey].items.length)) {
      return { message: SUBMISSION_FAILURE_MESSAGE.GUIDE_INCOMPLETE, ...echo };
    }
    if (stageKey === StageKey.s3) {
      const missing = s3Missing(parsed.data as Parameters<typeof s3Missing>[0]);
      if (missing) return { message: SUBMISSION_FAILURE_MESSAGE[missing], ...echo };
    }
  }

  /*
    과금 유형은 payload가 아니라 참가 기록에 붙는다. 잠겼을 때는 화면이 hidden으로
    같은 값을 실어 보낸다 — disabled select는 FormData에서 빠지기 때문이다.
  */
  const chargeType =
    stageKey === StageKey.s1
      ? String(formData.get("chargeType") ?? "") === ChargeType.inquiry
        ? ChargeType.inquiry
        : ChargeType.payment
      : undefined;

  const saved = await saveStage({
    entryId: viewer.entry.id,
    seasonId: viewer.season.id,
    userId: viewer.user.id,
    stageKey,
    payload: parsed.data as Prisma.InputJsonObject,
    intent,
    chargeType,
  });
  if (!saved.ok) {
    return { message: SUBMISSION_FAILURE_MESSAGE[saved.code], ...echo };
  }

  revalidatePath(`/dashboard/submit/${stageKey}`);
  /* 제출은 대시보드의 결론(nextAction)과 사이드바의 링크를 바꾼다 */
  if (intent === "submit") revalidatePath("/dashboard", "layout");
  return { done: intent === "draft" ? "draft" : "submitted", ...echo };
}

function flatten(error: {
  issues: { path: (string | number | symbol)[]; message: string }[];
}): SubmissionFieldErrors {
  const out: SubmissionFieldErrors = {};
  for (const issue of error.issues) {
    /* `alternatives.0.name` → `alt0` 처럼 폼 이름으로 되돌린다 */
    const [head, index, leaf] = issue.path;
    const key =
      head === "alternatives" && typeof index === "number"
        ? `alt${index}${leaf === "pain" ? "pain" : ""}`
        : head === "notBuilding" && typeof index === "number"
          ? `notBuilding${index}`
          : String(head ?? "");
    if (!key) continue;
    out[key] = [...(out[key] ?? []), issue.message];
  }
  return out;
}
