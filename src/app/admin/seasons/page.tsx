import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  시즌 관리 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("adminSeasons") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "시즌 관리",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { access } = await guardPage("adminSeasons", "/admin/seasons");

  return (
    <Scaffold
      title="시즌 관리"
      purpose="시즌·스테이지·트랙을 만들고 일정과 설정을 관리한다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "시즌 생성·수정",
        "페이즈 전환 시각표 등록 — 크론이 이 표만 읽는다",
        "기능 플래그 편집",
        "채점 설정 편집",
        "트랙·스테이지 관리",
      ]}
    />
  );
}
