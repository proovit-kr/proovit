import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  소명 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("dashboardAppeal") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "소명",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("dashboardAppeal", "/dashboard/appeal");

  return (
    <Scaffold
      title="소명"
      purpose="판정이나 제재에 이의를 제기하는 유일한 창구다. 실격 상태에서도 열려 있어야 한다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "통지 후 5영업일 이내 접수",
        "근거 지표 첨부",
        "운영자 서면 답변 조회",
        "정정 여부 표시",
      ]}
      blockedBy="appeals 테이블이 아직 제안 단계입니다(2026-08-13 신설, 규칙 해석 확인 대기)."
    />
  );
}
