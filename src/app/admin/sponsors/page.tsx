import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  스폰서·크레딧 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("adminSponsors") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "스폰서·크레딧",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("adminSponsors", "/admin/sponsors");

  return (
    <Scaffold
      title="스폰서·크레딧"
      purpose="스폰서를 등록하고 크레딧 코드를 올린다."
      locked={access.ok ? undefined : access.message}
      elements={["스폰서 관리", "코드 배치 업로드", "소진 현황"]}
      blockedBy="스폰서 협의가 진행 중입니다."
    />
  );
}
