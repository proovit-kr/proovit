import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  알림센터 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("notifications") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "알림센터",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("notifications", "/notifications");

  return (
    <Scaffold
      title="알림센터"
      purpose="마감·심사 결과·초대 알림을 모아 본다."
      locked={access.ok ? undefined : access.message}
      elements={["목록", "읽음·전체 읽음", "메일·알림톡 도달 결과"]}
      blockedBy="알림 발송이 아직 붙지 않았습니다. 메일은 도메인(proovit.kr) 확보가 선행이고, 알림톡은 발신프로필 심사가 선행입니다."
    />
  );
}
