import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  리더보드 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("leaderboard") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "리더보드",
};

export default async function Page() {
  const { access } = await guardPage("leaderboard", "/seasons");

  return (
    <Scaffold
      title="리더보드"
      purpose="서비스의 얼굴이자 관전 통로. 참가자가 스스로 홍보하게 만드는 자리다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "순위·점수·트래픽·매출",
        "집계 주기에 따라 자동 갱신 — 사람이 확정하지 않아도 움직인다",
        "실격·자진포기 팀은 즉시 빠진다",
        "미배포 팀은 「미배포」로 표시하고 지표 0",
        "SNS 카드(OG) 이미지",
      ]}
      blockedBy="채점식이 확정되지 않아 순위를 계산할 근거가 없습니다. 측정 파이프라인(엣지 프록시)도 아직 붙지 않았습니다."
    />
  );
}
