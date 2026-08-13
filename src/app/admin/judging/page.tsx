import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  심사 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("adminJudging") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "심사",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("adminJudging", "/admin/judging");

  return (
    <Scaffold
      title="심사"
      purpose="게이트 자동 심사를 돌리고 예외만 손으로 고친다. 사람이 점수를 매기지 않는다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "게이트(s2·s5) 일괄 자동 심사 실행",
        "판정 목록 — 스테이지·결과 필터",
        "개별 판정 오버라이드 (사유 필수)",
        "AI 참고 리포트 — 점수에 반영하지 않는다",
      ]}
      blockedBy="심사 기준 정본과 채점식이 확정되지 않았습니다."
    />
  );
}
