"use server";

import { revalidatePath } from "next/cache";

import { PaymentProvider } from "@/generated/prisma/enums";
import { canAccess, loadViewerState, toAccessContext } from "@/lib/access";
import { MerchantIdSchema, PAYMENT_FAILURE_MESSAGE } from "@/lib/payment";
import { savePaymentIntegration } from "@/lib/payment-store";

/*
  결제 연동 등록.

  ⚠️ 키는 받지 않는다(payment.ts 머리 주석). 폼에 칸이 없고, 있더라도 이 액션이
  읽지 않는다 — 화면만 고쳐서 키를 흘려보낼 수 있는 길을 만들지 않는다.
*/

export type PaymentState = {
  message?: string;
  error?: string;
  done?: boolean;
  values?: { provider: string; merchantId: string };
};

export async function savePayment(
  _prev: PaymentState,
  formData: FormData,
): Promise<PaymentState> {
  const values = {
    provider: String(formData.get("provider") ?? ""),
    merchantId: String(formData.get("merchantId") ?? ""),
  };

  const viewer = await loadViewerState();
  if (!viewer.user) {
    return { message: "로그인이 풀렸습니다. 다시 로그인해 주세요.", values };
  }
  if (!viewer.entry || !viewer.team) {
    return { message: "참가 기록이 없습니다.", values };
  }

  const permission = canAccess("dashboardPayment", toAccessContext(viewer));
  if (!permission.ok) return { message: permission.message, values };
  if (!viewer.team.isLeader) {
    return { message: "결제 연동은 팀장만 등록할 수 있습니다.", values };
  }

  const provider =
    values.provider === PaymentProvider.portone
      ? PaymentProvider.portone
      : values.provider === PaymentProvider.toss
        ? PaymentProvider.toss
        : null;
  if (!provider) return { message: "결제사를 골라 주세요.", values };

  const merchantId = MerchantIdSchema.safeParse(values.merchantId);
  if (!merchantId.success) {
    return { error: merchantId.error.issues[0]?.message, values };
  }

  const result = await savePaymentIntegration({
    entryId: viewer.entry.id,
    provider,
    merchantId: merchantId.data,
  });
  if (!result.ok) {
    return { message: PAYMENT_FAILURE_MESSAGE[result.code], values };
  }

  revalidatePath("/dashboard/payment");
  revalidatePath("/dashboard");
  return { done: true, values };
}
