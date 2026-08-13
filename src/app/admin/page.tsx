import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  운영 대시보드 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("admin") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "운영 대시보드",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("admin", "/admin");

  return (
    <Scaffold
      title="운영 대시보드"
      purpose="시즌이 지금 어떻게 굴러가고 있는지 한 화면에서 본다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "시즌 KPI 4종 — 참가팀·배포수·참가작 총유저·성공사례",
        "우리 퍼널 — 방문 → 리드 → 가입 → 참가 → 제출 → 완주",
        "감사 로그 바로가기",
      ]}
      blockedBy="측정을 파는 서비스가 자기 퍼널을 측정하지 않으면 안 됩니다. 집계가 붙는 대로 채웁니다."
    />
  );
}
