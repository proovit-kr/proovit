"use server";

import { revalidatePath } from "next/cache";

import { CREDITS_TOAST } from "@/content/credits";
import { canAccess, loadViewerState, toAccessContext } from "@/lib/access";
import { CREDIT_FAILURE_MESSAGE } from "@/lib/credits";
import { claimCredit, setCreditApplied } from "@/lib/credits-store";

/*
  혜택 받기 · 적용 확인.

  ⚠️ 두 액션 다 `canAccess`를 **다시** 부른다. 화면이 버튼을 숨겼다는 사실은
  아무것도 보장하지 않는다 — 액션은 폼을 거치지 않고 직접 호출할 수 있는
  엔드포인트다(payment/actions.ts와 같은 이유).

  ⚠️ 팀장 제한을 걸지 않는다. 혜택은 팀 자원이고 받는 순간 팀 전체에 붙는다.
  누가 눌렀는지는 감사 로그가 남기면 되고, 팀장만 누를 수 있게 하면 팀장이
  자리를 비운 주에 크레딧이 통째로 놀게 된다.
*/

export type CreditActionState = {
  message?: string;
  /** 성공했을 때 토스트로 띄울 한 줄 */
  done?: string;
};

async function guard() {
  const viewer = await loadViewerState();
  if (!viewer.user) {
    return { error: "로그인이 풀렸어요. 다시 로그인해 주세요." } as const;
  }
  if (!viewer.entry) return { error: "참가 기록이 없어요." } as const;

  const permission = canAccess("dashboardCredits", toAccessContext(viewer));
  if (!permission.ok) return { error: permission.message } as const;

  return { entry: viewer.entry } as const;
}

export async function claimCreditAction(
  _prev: CreditActionState,
  formData: FormData,
): Promise<CreditActionState> {
  const offerId = String(formData.get("offerId") ?? "");
  if (!offerId) return { message: "어떤 혜택인지 알 수 없어요." };

  const gate = await guard();
  if ("error" in gate) return { message: gate.error };

  /* 열렸는지·받을 수 있는 팀인지는 저장소가 화면과 같은 함수로 다시 잰다 */
  const result = await claimCredit({ entryId: gate.entry.id, offerId });
  if (!result.ok) return { message: CREDIT_FAILURE_MESSAGE[result.code] };

  revalidatePath("/dashboard/credits");
  return { done: result.scheduled ? CREDITS_TOAST.scheduled : CREDITS_TOAST.claimed };
}

export async function setAppliedAction(
  _prev: CreditActionState,
  formData: FormData,
): Promise<CreditActionState> {
  const offerId = String(formData.get("offerId") ?? "");
  const applied = formData.get("applied") === "1";
  if (!offerId) return { message: "어떤 혜택인지 알 수 없어요." };

  const gate = await guard();
  if ("error" in gate) return { message: gate.error };

  const result = await setCreditApplied({
    entryId: gate.entry.id,
    offerId,
    applied,
  });
  if (!result.ok) return { message: CREDIT_FAILURE_MESSAGE[result.code] };

  revalidatePath("/dashboard/credits");
  return { done: applied ? CREDITS_TOAST.confirmed : CREDITS_TOAST.unconfirmed };
}
