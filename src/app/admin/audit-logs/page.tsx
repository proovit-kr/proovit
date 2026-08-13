import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  감사 로그 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("adminAuditLogs") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "감사 로그",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("adminAuditLogs", "/admin/audit-logs");

  return (
    <Scaffold
      title="감사 로그"
      purpose="운영자가 언제 무엇을 왜 바꿨는지 전량 남긴다. 심사 분쟁의 방어선이다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "대상·행위·사유·시각",
        "대상 종류·아이디로 검색",
        "사유는 필수 — 비워둘 수 없다",
      ]}
    />
  );
}
