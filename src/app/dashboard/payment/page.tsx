import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { guardPage } from "@/lib/access";
import { loadMeasurement } from "@/lib/measurement-store";
import { paymentPane } from "@/lib/payment";
import {
  loadPaymentIntegration,
  loadPaymentRevenue,
} from "@/lib/payment-store";
import { prisma } from "@/lib/prisma";

import hub from "../hub.module.css";
import { PaymentPanel } from "./PaymentPanel";

/*
  결제 연동 — 시안 `#scr-payment` 세 판(① 결제형 미등록 · ② 결제형 등록과
  테스트 완료 · ③ 문의형).

  판은 s1 제출값인 과금 유형(entries.charge_type)과 연동 행의 상태가 정한다
  (payment.ts `paymentPane`). 시안에 없는 `pending`(등록은 했는데 확인 전)은
  ②의 모양에 회색 배지다. 네 판을 보려면 개발 바의 「결제 연동」 줄을 누른다.

  ①은 시안대로 조회 전용 키를 받는다. 저장은 잠그고(payment-crypto.ts) 화면에는
  가린 모양만 나간다(payment-store.ts). 조회키가 안 읽히면(키 회전·값 손상) ②에
  「다시 등록」 안내가 선다.

  보기는 팀원도 하고 쓰기는 팀장만 한다 — 정책의 `leaderOnly`가 팀원에게는
  `access.ok=false`와 안내 문구를 주고, 화면은 그 문구를 경고줄로 올린 채
  버튼만 뺀다.
*/

export const metadata: Metadata = {
  title: "결제 연동",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { viewer, access } = await guardPage(
    "dashboardPayment",
    "/dashboard/payment",
  );
  if (!viewer.entry || !viewer.team) notFound();

  const entryId = viewer.entry.id;
  const [view, entry, measurement, revenue] = await Promise.all([
    loadPaymentIntegration(entryId),
    prisma.entry.findUniqueOrThrow({
      where: { id: entryId },
      select: { chargeType: true, inquiryUrl: true },
    }),
    loadMeasurement(entryId),
    loadPaymentRevenue(entryId),
  ]);

  const pane = paymentPane({ chargeType: entry.chargeType, status: view.status });

  return (
    <>
      {/* 시안의 경고줄은 제목보다 위다(허브·팀 관리·측정 연동과 같은 자리) */}
      {!access.ok ? (
        <div className={`${hub.wbar} ${hub.wbarWarn}`} role="status">
          {access.message}
        </div>
      ) : null}

      <h2 className={hub.h1}>결제 연동</h2>
      <p className={hub.sub}>
        수익화를 시도할 팀만 하면 되는 선택 단계예요. 화면은 s1에서 고른 과금
        유형을 따라가요.
      </p>

      <PaymentPanel
        pane={pane}
        provider={view.provider ?? "toss"}
        keyMasked={view.keyMasked}
        lastTestedAt={view.lastTestedAt?.toISOString() ?? null}
        revenue={revenue}
        inquiryUrl={entry.inquiryUrl ?? ""}
        hostname={measurement.hostname}
        canWrite={access.ok}
      />
    </>
  );
}
