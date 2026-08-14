import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { ChargeType, IntegrationStatus } from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import { loadPaymentIntegration } from "@/lib/payment-store";
import { prisma } from "@/lib/prisma";

import { PaymentForm } from "./PaymentForm";

import styles from "./payment.module.css";

/*
  결제 연동 — PLN3 2장. 매출 지표(R축)의 입구다.

  ⚠️ **키를 받지 않는다.** 스키마가 암호화 저장을 전제하는데 암호화 키가 아직 없다
  (payment.ts 머리 주석). 지금 받는 것은 비밀이 아닌 값 둘 — 결제사와 상점 아이디다.

  ⚠️ 문의형 팀에게는 등록을 권하지 않는다. 과금 유형은 s1에서 굳는 값이고
  (entries.charge_type), 문의형은 매출이 아니라 문의 전환으로 심사받는다.
*/

export const metadata: Metadata = {
  title: "결제 연동",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = {
  [IntegrationStatus.pending]: "확인 대기",
  [IntegrationStatus.verified]: "연동 확인됨",
  [IntegrationStatus.failed]: "확인 실패",
  [IntegrationStatus.disabled]: "사용 안 함",
};

export default async function Page() {
  const { viewer, access } = await guardPage(
    "dashboardPayment",
    "/dashboard/payment",
  );
  if (!viewer.entry || !viewer.team) notFound();

  const [view, entry] = await Promise.all([
    loadPaymentIntegration(viewer.entry.id),
    prisma.entry.findUniqueOrThrow({
      where: { id: viewer.entry.id },
      select: { chargeType: true },
    }),
  ]);

  const inquiry = entry.chargeType === ChargeType.inquiry;
  const canWrite = access.ok && viewer.team.isLeader;

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <div className={styles.headTop}>
          <h1 className={styles.title}>결제 연동</h1>
          {view.status ? (
            <Badge
              tone={
                view.status === IntegrationStatus.verified ? "lime" : "neutral"
              }
            >
              {STATUS_LABEL[view.status] ?? view.status}
            </Badge>
          ) : null}
        </div>
        <p className={styles.purpose}>
          결제 내역을 매출 지표로 세려면 어느 결제사의 어느 상점인지 알아야
          합니다. 결제 복귀 주소는 팀 서브도메인이어야 지표에 잡힙니다.
        </p>

        {inquiry ? (
          <p className={styles.note}>
            이 팀은 <strong>문의형</strong>으로 등록돼 있어 매출이 아니라 문의
            전환으로 심사받습니다. 결제를 붙이지 않아도 됩니다.
          </p>
        ) : null}

        {!access.ok ? (
          <p className={styles.locked}>{access.message}</p>
        ) : !viewer.team.isLeader ? (
          <p className={styles.locked}>
            등록은 팀장만 할 수 있습니다. 내용은 그대로 볼 수 있습니다.
          </p>
        ) : null}
      </header>

      <PaymentForm
        defaults={{
          provider: view.provider ?? "toss",
          merchantId: view.merchantId ?? "",
        }}
        locked={view.locked}
        canWrite={canWrite}
      />

      {/*
        지금 안 되는 것을 밝힌다. 키를 넣을 자리를 찾다가 못 찾는 사람이
        문의하기 전에 여기서 답이 되어야 한다.
      */}
      <section className={styles.pendingBlock}>
        <h2 className={styles.pendingTitle}>아직 안 되는 것</h2>
        <ul className={styles.steps}>
          <li>
            조회 키·웹훅 시크릿 등록 — 암호화 저장이 붙은 뒤에 엽니다. 지금은
            받지 않습니다.
          </li>
          <li>
            자동 매출 집계 — 결제 웹훅을 받는 경로가 붙어야 시작됩니다. 그전에는
            증빙으로 심사합니다.
          </li>
          <li>
            연동 확인은 실제 결제가 들어와야 판정됩니다. 스스로 「연동됨」으로
            표시할 수는 없습니다.
          </li>
        </ul>
        <p className={styles.note}>
          결제 복귀 주소는{" "}
          <Link href="/dashboard/measurement" className={styles.link}>
            측정 연동
          </Link>
          에서 등록한 팀 주소로 맞춰 주세요.
        </p>
      </section>
    </section>
  );
}
