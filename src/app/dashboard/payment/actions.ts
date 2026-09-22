"use server";

import { revalidatePath } from "next/cache";

import { PaymentProvider } from "@/generated/prisma/enums";
import { canAccess, loadViewerState, toAccessContext } from "@/lib/access";
import { loadMeasurement } from "@/lib/measurement-store";
import {
  PAYMENT_FAILURE_MESSAGE,
  ReadonlyKeySchema,
  inquiryUrlSchema,
} from "@/lib/payment";
import {
  deletePaymentIntegration,
  saveInquiryUrl,
  savePaymentIntegration,
  testPaymentIntegration,
} from "@/lib/payment-store";

/*
  결제 연동의 쓰기 넷 — 등록(`register`) · 연동 테스트(`test`) · 삭제(`delete`) ·
  문의 수단 주소 저장(`inquiry`).

  ⚠️ 판정은 `canAccess("dashboardPayment")` 하나가 한다 — 화면이 폼을 그릴 때
  부르는 것과 같은 함수다. 정책의 `leaderOnly`가 팀장만 쓰게 걸고 있다.

  ⚠️ 조회키는 **되돌려 주지 않는다.** 검사에 걸려도 `values`에 키를 싣지 않는다 —
  서버 액션의 반환값은 클라이언트로 그대로 간다.
*/

export type PaymentActionState = {
  message?: string;
  errors?: { readonlyKey?: string; inquiryUrl?: string };
  /** 액션이 끝난 뒤 한 줄로 알릴 것(연동 테스트 결과 등) */
  notice?: string;
  values?: { provider: string; inquiryUrl: string };
};

export async function managePayment(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const op = String(formData.get("op") ?? "");
  const values = {
    provider: String(formData.get("provider") ?? ""),
    inquiryUrl: String(formData.get("inquiryUrl") ?? ""),
  };
  /* 키는 values에 넣지 않는다 — 반환값에 실려 나가면 안 된다 */
  const readonlyKey = String(formData.get("readonlyKey") ?? "");

  const viewer = await loadViewerState();
  if (!viewer.user) {
    return { message: "로그인이 풀렸어요. 다시 로그인해 주세요.", values };
  }
  if (!viewer.entry || !viewer.team) {
    return { message: "참가 기록이 없어요.", values };
  }

  const permission = canAccess("dashboardPayment", toAccessContext(viewer));
  if (!permission.ok) return { message: permission.message, values };

  const entryId = viewer.entry.id;

  if (op === "register") {
    const provider =
      values.provider === PaymentProvider.portone
        ? PaymentProvider.portone
        : values.provider === PaymentProvider.toss
          ? PaymentProvider.toss
          : null;
    if (!provider) return { message: "결제사를 골라 주세요.", values };

    const key = ReadonlyKeySchema.safeParse(readonlyKey);
    if (!key.success) {
      return {
        errors: { readonlyKey: key.error.issues[0]?.message },
        values,
      };
    }
    const result = await savePaymentIntegration({
      entryId,
      provider,
      readonlyKey: key.data,
    });
    if (!result.ok) {
      return { message: PAYMENT_FAILURE_MESSAGE[result.code], values };
    }
  } else if (op === "test") {
    const result = await testPaymentIntegration(entryId);
    if (!result.ok) {
      return { message: PAYMENT_FAILURE_MESSAGE[result.code], values };
    }
    revalidatePath("/dashboard/payment");
    return {
      notice: result.verified
        ? "연동이 확인된 상태예요."
        : "아직 확인 전이에요. 실제 결제가 들어오면 확인돼요.",
      values,
    };
  } else if (op === "delete") {
    const result = await deletePaymentIntegration(entryId);
    if (!result.ok) {
      return { message: PAYMENT_FAILURE_MESSAGE[result.code], values };
    }
  } else if (op === "inquiry") {
    const { hostname } = await loadMeasurement(entryId);
    const parsed = inquiryUrlSchema(hostname).safeParse(values.inquiryUrl);
    if (!parsed.success) {
      return {
        errors: { inquiryUrl: parsed.error.issues[0]?.message },
        values,
      };
    }
    await saveInquiryUrl({ entryId, inquiryUrl: parsed.data });
  } else {
    return { message: "알 수 없는 요청이에요.", values };
  }

  /* s5 제출 화면이 결제 연동 상태를 읽고, 허브 요약도 본다 */
  revalidatePath("/", "layout");
  return { values };
}
