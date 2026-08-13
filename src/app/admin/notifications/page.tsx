import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  공지 발송 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("adminNotifications") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "공지 발송",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage(
    "adminNotifications",
    "/admin/notifications",
  );

  return (
    <Scaffold
      title="공지 발송"
      purpose="대상을 골라 일괄 공지를 보낸다."
      locked={access.ok ? undefined : access.message}
      elements={["대상 필터 — 진도·트랙", "발송 이력", "도달 결과"]}
      blockedBy="메일 발송이 도메인 확보에 걸려 있습니다."
    />
  );
}
