import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  팀 관리 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("dashboardTeam") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "팀 관리",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("dashboardTeam", "/dashboard/team");

  return (
    <Scaffold
      title="팀 관리"
      purpose="팀원을 초대하고 팀장을 넘긴다. 쓰기는 팀장만 할 수 있다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "초대 코드 발급·취소",
        "합류 처리",
        "강퇴·본인 탈퇴",
        "팀장 이양",
      ]}
    />
  );
}
