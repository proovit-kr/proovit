import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  혜택·크레딧 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("dashboardCredits") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "혜택·크레딧",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("dashboardCredits", "/dashboard/credits");

  return (
    <Scaffold
      title="혜택·크레딧"
      purpose="스폰서가 주는 AI 툴·클라우드 이용권을 받는다. 진도에 따라 단계적으로 열린다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "발급 가능 목록 — 지금 진도로 열린 것만",
        "코드 발급 (팀당 1회)",
        "스폰서별 언락 조건",
      ]}
      blockedBy="스폰서 협의가 아직 진행 중입니다."
    />
  );
}
