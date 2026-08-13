import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  사전신청 리드 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("adminLeads") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "사전신청 리드",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("adminLeads", "/admin/leads");

  return (
    <Scaffold
      title="사전신청 리드"
      purpose="사전신청자를 조회하고 내려받는다. KPI#1의 관측 지점이다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "리드 목록 — 유입 채널·동의 상태",
        "CSV 추출",
        "기간별 신청 추이",
      ]}
    />
  );
}
