import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  어뷰징 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("adminAbuse") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "어뷰징",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("adminAbuse", "/admin/abuse");

  return (
    <Scaffold
      title="어뷰징"
      purpose="이상 트래픽·결제 플래그를 판정한다. 플래그는 표시일 뿐 실격이 아니다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "플래그 목록 — 접수·소명·인용·기각",
        "무효 처리·트래픽 보정 (사유 필수)",
        "IP 차단 등록",
        "참가자 소명 검토",
      ]}
      blockedBy="이상 탐지 기준 비율과 다중 계정 판정 방식이 정해지지 않았습니다."
    />
  );
}
