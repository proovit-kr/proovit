import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  지표 검토 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("adminMetrics") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "지표 검토",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("adminMetrics", "/admin/metrics");

  return (
    <Scaffold
      title="지표 검토"
      purpose="이상 탐지에 걸린 건만 검토한다. 전 팀을 손으로 확인하지 않는다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "플래그된 건 검토 큐",
        "오염분 제외 후 재집계",
        "최종 순위 확정 — 환불 유예 뒤",
      ]}
      blockedBy="측정 파이프라인과 이상 탐지 기준이 아직 없습니다."
    />
  );
}
