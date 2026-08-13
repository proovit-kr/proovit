import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  스테이지 제출 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("dashboardSubmit") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "스테이지 제출",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("dashboardSubmit", "/dashboard/submit");

  return (
    <Scaffold
      title="스테이지 제출"
      purpose="s1~s5 다섯 번의 제출을 받는다. 게이트는 s2·s5 둘뿐이고 나머지는 제출만 받는다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "스테이지별 필드 (PLN6 필드 정의서)",
        "가이드 완료 체크리스트",
        "증빙 파일 첨부",
        "재제출 — 마감 전까지 몇 번이든",
        "s4만 주간 반복",
      ]}
      blockedBy="s2의 지표 칸(방문자 수·사전 신청자 수)이 입력 폼인지 확인 화면인지 정해지지 않았습니다. 랜딩도 서브도메인에 올리게 하면 자동 집계가 되어 읽기 전용이 됩니다."
    />
  );
}
