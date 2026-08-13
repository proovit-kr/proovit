import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  결제 연동 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("dashboardPayment") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "결제 연동",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("dashboardPayment", "/dashboard/payment");

  return (
    <Scaffold
      title="결제 연동"
      purpose="참가자 PG 상점의 조회 전용 키를 등록한다. 매출 집계의 입구다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "PG 조회키·MID 등록 — 암호화 저장",
        "연동 테스트",
        "등록 상태 조회 (키는 마스킹)",
      ]}
      blockedBy="대금은 참가자에게 직접 가고 우리는 거래 이벤트만 읽습니다. PG 계약과 결제대행사 사업자 명의가 아직 확인 대기입니다."
    />
  );
}
