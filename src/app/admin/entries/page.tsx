import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  참가 관리 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("adminEntries") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "참가 관리",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("adminEntries", "/admin/entries");

  return (
    <Scaffold
      title="참가 관리"
      purpose="참가팀의 진도와 상태를 바꾼다. 모든 쓰기에 사유가 남는다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "엔트리 목록 — 진도·상태·플래그 필터·검색",
        "개별 스테이지 전환",
        "실격·복귀 처리 (사유 필수)",
        "게이트 미통과와 규칙 위반 실격은 다른 값으로 다룬다",
      ]}
    />
  );
}
