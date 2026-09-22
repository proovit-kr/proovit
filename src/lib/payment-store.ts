import {
  IntegrationStatus,
  PaymentProvider,
  TransactionStatus,
} from "@/generated/prisma/enums";
import { devNow } from "@/lib/dev-clock";
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
  /** 참가자가 「연동 테스트」를 마지막으로 누른 시각(시안 ② 힌트) */
  lastTestedAt: Date | null;
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
      lastTestedAt: true,
    },
  });

  if (!row) {
    return {
      provider: null,
      merchantId: null,
      status: null,
      verifiedAt: null,
      lastTestedAt: null,
      locked: false,
    };
  }

  return {
    provider: row.provider,
    merchantId: row.merchantId,
    status: row.status,
    verifiedAt: row.verifiedAt,
    lastTestedAt: row.lastTestedAt,
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
      lastTestedAt: null,
    },
  });

  return { ok: true };
}

/**
 * 시안 ②의 「연동 테스트」.
 *
 * ⚠️ 지금은 **확인 상태를 다시 읽고 누른 시각을 남기는 것뿐이다.** 키가 없어
 * PG에 물을 수 없고(payment.ts), 웹훅 경로도 아직 없다. 웹훅이 붙으면 이 함수가
 * PG에 실제로 묻는 자리다. 내가 정함(2026-09-22), 수연 확인 대기.
 */
export async function testPaymentIntegration(
  entryId: string,
): Promise<PaymentResult & { verified?: boolean }> {
  const current = await prisma.paymentIntegration.findUnique({
    where: { entryId },
    select: { status: true },
  });
  if (!current) return { ok: false, code: "NOT_FOUND" };
  await prisma.paymentIntegration.update({
    where: { entryId },
    data: { lastTestedAt: devNow() },
  });
  return { ok: true, verified: current.status === IntegrationStatus.verified };
}

/** 시안 ②의 「삭제」 — ①로 돌아간다. 확인이 끝난 뒤에는 잠긴다(등록·변경과 같은 규칙) */
export async function deletePaymentIntegration(
  entryId: string,
): Promise<PaymentResult> {
  const current = await prisma.paymentIntegration.findUnique({
    where: { entryId },
    select: { status: true },
  });
  if (!current) return { ok: true };
  if (current.status === IntegrationStatus.verified) {
    return { ok: false, code: "LOCKED" };
  }
  await prisma.paymentIntegration.delete({ where: { entryId } });
  return { ok: true };
}

/** 시안 ③의 「문의 수단 주소」. 검사는 액션이 팀 주소를 들고 한다(payment.ts) */
export async function saveInquiryUrl(args: {
  entryId: string;
  inquiryUrl: string;
}): Promise<void> {
  await prisma.entry.update({
    where: { id: args.entryId },
    data: { inquiryUrl: args.inquiryUrl },
  });
}

/**
 * 시안 ②의 요약 — 집계된 매출과 결제 건수. 결제 완료(paid)이고 제외되지 않은
 * 거래만 센다. 환불·취소는 매출 지표의 순매출 계산에서 따로 빠지므로 여기서는
 * 결제 건 자체를 세지 않는다.
 */
export async function loadPaymentRevenue(
  entryId: string,
): Promise<{ amount: number; count: number }> {
  const agg = await prisma.transaction.aggregate({
    where: { entryId, status: TransactionStatus.paid, isExcluded: false },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return { amount: Number(agg._sum.amount ?? 0), count: agg._count._all };
}
