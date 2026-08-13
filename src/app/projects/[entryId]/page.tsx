import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  참가작 상세 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("projectDetail") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "참가작 상세",
};

export default async function Page() {
  const { access } = await guardPage("projectDetail", "/projects");

  return (
    <Scaffold
      title="참가작 상세"
      purpose="개별 참가작을 외부에 소개한다. 참가자가 공유하는 링크의 목적지다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "아이디어 제목·소개·서비스 주소",
        "공개 지표 — 실시간이 아니라 전일까지만",
        "지표 공개에 동의한 팀만 숫자를 노출",
        "SNS 카드(OG) 이미지",
      ]}
      blockedBy="지표 집계가 아직 없습니다. 공개를 하루 늦추는 것은 경쟁팀이 실시간으로 남의 유입을 추적하면 어뷰징 유인이 생기기 때문입니다."
    />
  );
}
