import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  측정 연동 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("dashboardMeasurement") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "측정 연동",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage(
    "dashboardMeasurement",
    "/dashboard/measurement",
  );

  return (
    <Scaffold
      title="측정 연동"
      purpose="내 참가작을 우리 측정 체계에 연결하고 정상 동작을 검증한다. 이걸 통과해야 배포 완료로 인정된다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "팀명.proovit.kr 서브도메인 발급",
        "연동 검증 상태 — 배포·소유권·TLS",
        "우회(DNS 직결) 감지 표시",
        "GA4 속성 등록 — 체류시간 보조 확인용",
      ]}
      blockedBy="Cloudflare 엣지 프록시가 아직 붙지 않았습니다. 도메인(proovit.kr) 확보도 선행입니다."
    />
  );
}
