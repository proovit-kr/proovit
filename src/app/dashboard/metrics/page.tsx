import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  내 지표 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("dashboardMetrics") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "내 지표",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("dashboardMetrics", "/dashboard/metrics");

  return (
    <Scaffold
      title="내 지표"
      purpose="내 참가작의 지표와 지금 순위를 본다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "일별 시계열 — 유효 방문·가입·매출",
        "채점 축과 참고 지표를 나눠서",
        "유입 채널 분포",
        "이상 탐지 플래그와 소명 창구",
      ]}
      blockedBy="측정 파이프라인이 아직 없습니다. 배포 직후에는 「아직 방문이 없습니다」로 그립니다."
    />
  );
}
