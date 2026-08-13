import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  보증금 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("dashboardDeposit") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "보증금",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("dashboardDeposit", "/dashboard/deposit");

  return (
    <Scaffold
      title="보증금"
      purpose="완주를 담보로 받는 보증금을 결제하고, 끝난 뒤 환불을 신청한다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "결제 세션 생성",
        "웹훅으로 확정",
        "완주 후 환불 신청",
        "미완주 시 귀속",
      ]}
      blockedBy="시즌1 도입 여부가 정해지지 않았습니다. feature_flags.deposit으로 꺼둔 상태입니다."
    />
  );
}
