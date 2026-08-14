import {
  IntegrationStatus,
  PaymentProvider,
} from "@/generated/prisma/enums";
import type { PaymentFailureCode } from "@/lib/payment";
import { prisma } from "@/lib/prisma";

/*
  결제 연동 저장. **서버 전용이다** — 규칙은 payment.ts에 있다.

  ⚠️ 이 파일은 **키를 다루지 않는다.** `readonly_key_enc`·`webhook_secret_enc`는
  건드리지 않고 그대로 비워 둔다(payment.ts 머리 주석). 암호화가 붙으면 그때
  이 파일에 함수가 하나 더 생기고, 그 함수만 키를 안다.
*/

export type PaymentView = {
  provider: PaymentProvider | null;
  merchantId: string | null;
  status: IntegrationStatus | null;
  verifiedAt: Date | null;
  /** 확인이 끝나면 못 바꾼다 — 매출이 어느 상점 건인지가 흔들린다 */
  locked: boolean;
};

export async function loadPaymentIntegration(
  entryId: string,
): Promise<PaymentView> {
  const row = await prisma.paymentIntegration.findUnique({
    where: { entryId },
    select: {
      provider: true,
      merchantId: true,
      status: true,
      verifiedAt: true,
    },
  });

  if (!row) {
    return {
      provider: null,
      merchantId: null,
      status: null,
      verifiedAt: null,
      locked: false,
    };
  }

  return {
    provider: row.provider,
    merchantId: row.merchantId,
    status: row.status,
    verifiedAt: row.verifiedAt,
    locked: row.status === IntegrationStatus.verified,
  };
}

export type PaymentResult = { ok: true } | { ok: false; code: PaymentFailureCode };

/**
 * 연동 정보 등록·변경.
 *
 * 상태는 `pending`에서 시작한다. 확인(verified)은 실제 결제 웹훅이 들어와야
 * 가능한 판정이라 화면에서 만들지 않는다 — 참가자가 스스로 "연동됨"으로
 * 표시할 수 있으면 그 상태값은 아무것도 증명하지 못한다.
 */
export async function savePaymentIntegration(args: {
  entryId: string;
  provider: PaymentProvider;
  merchantId: string;
}): Promise<PaymentResult> {
  const { entryId, provider, merchantId } = args;

  const current = await prisma.paymentIntegration.findUnique({
    where: { entryId },
    select: { status: true },
  });
  if (current?.status === IntegrationStatus.verified) {
    return { ok: false, code: "LOCKED" };
  }

  await prisma.paymentIntegration.upsert({
    where: { entryId },
    create: {
      entryId,
      provider,
      merchantId,
      status: IntegrationStatus.pending,
    },
    update: {
      provider,
      merchantId,
      /* 바꾸면 확인 절차를 처음부터 다시 한다 */
      status: IntegrationStatus.pending,
      verifiedAt: null,
    },
  });

  return { ok: true };
}
