import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  시상 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("adminAwards") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "시상",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("adminAwards", "/admin/awards");

  return (
    <Scaffold
      title="시상"
      purpose="최종 순위를 확정하고 수상 내역을 등록한다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "수상 등록 — 종합·부문",
        "상금·부상 내역",
        "제재로 인한 취소·환수 반영",
      ]}
      blockedBy="채점식과 시상 구조가 확정되지 않았습니다. 총 상금 금액도 미확정입니다."
    />
  );
}
