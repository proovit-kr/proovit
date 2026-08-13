import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  시즌 아카이브 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("seasonArchive") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "시즌 아카이브",
};

export default async function Page() {
  const { access } = await guardPage("seasonArchive", "/seasons");

  return (
    <Scaffold
      title="시즌 아카이브"
      purpose="지난 시즌의 결과를 보관한다. 시즌2부터 의미가 생긴다."
      locked={access.ok ? undefined : access.message}
      elements={["지난 시즌 목록", "최종 순위", "수상 내역"]}
    />
  );
}
