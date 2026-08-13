import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  심사 결과 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("dashboardJudgments") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "심사 결과",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage(
    "dashboardJudgments",
    "/dashboard/judgments",
  );

  return (
    <Scaffold
      title="심사 결과"
      purpose="내 통과·보류·탈락 결과와 그 근거를 본다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "스테이지별 판정 — 통과 / 보완 / 미통과",
        "항목별 근거",
        "2차는 배점까지 공개, 1차는 결과와 근거만",
        "채점식 버전 — 그때 규칙으로는 이랬다는 증명",
      ]}
      blockedBy="심사 기준과 채점식이 확정되지 않았습니다."
    />
  );
}
