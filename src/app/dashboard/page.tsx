import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  대시보드 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("dashboard") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "대시보드",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("dashboard", "/dashboard");

  return (
    <Scaffold
      title="대시보드"
      purpose="지금 무엇을 해야 하는지 하나만 보여준다. 골든패스의 진입점이다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "시즌 단계와 내 진행도의 조합으로 다르게 그린다",
        "다음 액션 버튼 하나 (GET /api/v1/me의 nextAction)",
        "막고 있는 것 목록 (blockedReasons)",
        "온보딩 체크리스트 — 팀 구성 → 측정 연동",
      ]}
    />
  );
}
