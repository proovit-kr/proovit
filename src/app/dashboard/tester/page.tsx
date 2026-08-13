import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  상호 테스터 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("dashboardTester") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "상호 테스터",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("dashboardTester", "/dashboard/tester");

  return (
    <Scaffold
      title="상호 테스터"
      purpose="배정받은 다른 팀 제품을 써보고 피드백을 남긴다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "주차별 배정 현황",
        "접속 토큰 — 이 토큰이 붙은 방문은 상대 팀 지표에서 빠진다",
        "피드백 작성",
        "의무 이행 현황",
      ]}
      blockedBy="시즌1에 켤지가 상충 상태입니다. 운영규칙 제14조는 시즌1 의무로 정하는데 옛 요구사항 정리본은 미사용으로 적혀 있습니다."
    />
  );
}
