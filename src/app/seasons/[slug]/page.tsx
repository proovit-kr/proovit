import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  시즌 상세 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("seasonDetail") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "시즌 상세",
};

export default async function Page() {
  const { access } = await guardPage("seasonDetail", "/seasons");

  return (
    <Scaffold
      title="시즌 상세"
      purpose="이번 시즌이 언제 무엇을 하는 시즌인지 보여준다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "스테이지 타임라인 — 각 단계가 열리고 닫히는 정확한 시각",
        "참가 트랙",
        "지금 어느 단계인지",
        "참가 CTA",
      ]}
      blockedBy="시즌1 캘린더가 아직 잠정입니다. stages.opens_at·closes_at이 비어 있어 타임라인에 넣을 시각이 없습니다."
    />
  );
}
