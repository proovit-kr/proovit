"use server";

import { revalidatePath } from "next/cache";

import { canAccess, loadViewerState, toAccessContext } from "@/lib/access";
import {
  APPEAL_FAILURE_MESSAGE,
  APPEAL_REASON_MAX,
  type AppealTargetType,
} from "@/lib/appeal";
import { submitAppeal } from "@/lib/appeal-store";

/*
  이의신청 접수.

  ⚠️ **실격 팀도 이 액션을 부를 수 있어야 한다.** 라우트 정책이 `allowInactive`인
  이유가 그것이다 — 실격을 다투는 자리를 실격을 이유로 막으면 규칙 제11조가
  보장한 절차를 우리가 닫는 셈이 된다. 판정은 `canAccess("dashboardAppeal")`이 하고
  여기서는 그 결과만 따른다.

  ⚠️ 팀장만 낸다. 이의신청은 팀 전체를 대표하는 의사 표시다.
*/

export type AppealState = {
  message?: string;
  done?: boolean;
  values?: { target: string; reason: string };
};

export async function fileAppeal(
  _prev: AppealState,
  formData: FormData,
): Promise<AppealState> {
  const rawTarget = String(formData.get("target") ?? "");
  const reason = String(formData.get("reason") ?? "").slice(
    0,
    APPEAL_REASON_MAX,
  );
  const values = { target: rawTarget, reason };

  const viewer = await loadViewerState();
  if (!viewer.user) {
    return { message: "로그인이 풀렸습니다. 다시 로그인해 주세요.", values };
  }
  if (!viewer.entry || !viewer.team) {
    return { message: "참가 기록이 없습니다.", values };
  }

  const permission = canAccess("dashboardAppeal", toAccessContext(viewer));
  if (!permission.ok) return { message: permission.message, values };
  if (!viewer.team.isLeader) {
    return { message: "이의신청은 팀장이 접수합니다.", values };
  }

  /* 대상은 "종류:id" 한 값으로 온다 — 라디오가 여럿이라 이름을 나누면 짝이 어긋난다 */
  const [type, id] = rawTarget.split(":");
  if ((type !== "judgment" && type !== "abuse_flag") || !id) {
    return { message: "무엇에 대한 이의신청인지 골라 주세요.", values };
  }

  const result = await submitAppeal({
    entryId: viewer.entry.id,
    target: { type: type as AppealTargetType, id },
    reason,
  });
  if (!result.ok) {
    return { message: APPEAL_FAILURE_MESSAGE[result.code], values };
  }

  revalidatePath("/dashboard/appeal");
  revalidatePath("/dashboard");
  return { done: true, values };
}
