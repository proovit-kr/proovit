"use server";

import { revalidatePath } from "next/cache";

import { APPEAL_MESSAGE } from "@/content/appeal";
import { canAccess, loadViewerState, toAccessContext } from "@/lib/access";
import { APPEAL_FAILURE_MESSAGE, APPEAL_REASON_MAX } from "@/lib/appeal";
import { submitAppeal } from "@/lib/appeal-store";
import { parseTargetValue } from "@/lib/appeal-view";

/*
  소명 접수.

  ⚠️ **실격 팀도 이 액션을 부를 수 있어야 한다.** 라우트 정책이 `allowInactive`인
  이유가 그것이다 — 실격을 다투는 자리를 실격을 이유로 막으면 규칙 제6조가
  보장한 절차를 우리가 닫는 셈이 된다. 판정은 `canAccess("dashboardAppeal")`이 하고
  여기서는 그 결과만 따른다.

  ⚠️ 팀장만 낸다. 소명은 팀 전체를 대표하는 의사 표시다.
*/

export type AppealState = {
  message?: string;
  values?: { target: string; reason: string };
};

export async function fileAppeal(
  _prev: AppealState,
  formData: FormData,
): Promise<AppealState> {
  const target = String(formData.get("target") ?? "");
  const reason = String(formData.get("reason") ?? "").slice(0, APPEAL_REASON_MAX);
  const files = formData.getAll("files").map(String).filter(Boolean);
  const values = { target, reason };

  const viewer = await loadViewerState();
  if (!viewer.user) return { message: APPEAL_MESSAGE.sessionLost, values };
  if (!viewer.entry || !viewer.team) return { message: APPEAL_MESSAGE.noEntry, values };

  const permission = canAccess("dashboardAppeal", toAccessContext(viewer));
  if (!permission.ok) return { message: permission.message, values };
  if (!viewer.team.isLeader) return { message: APPEAL_MESSAGE.leaderOnly, values };

  const parsed = parseTargetValue(target);
  if (!parsed) return { message: APPEAL_MESSAGE.noTarget, values };

  const result = await submitAppeal({
    entryId: viewer.entry.id,
    target: parsed,
    reason,
    files,
  });
  if (!result.ok) return { message: APPEAL_FAILURE_MESSAGE[result.code], values };

  /* 헤더의 「소명 접수됨」·허브 h14가 같이 바뀐다 */
  revalidatePath("/", "layout");
  return {};
}
