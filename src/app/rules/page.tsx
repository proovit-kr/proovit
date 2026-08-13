import type { Metadata } from "next";

import { Scaffold } from "@/components/Scaffold";
import { guardPage } from "@/lib/access";

/*
  규칙 — PLN3 화면정의서 2장 카탈로그.

  아직 자리표시다. 라우트·접근 제어·동선을 먼저 깔아두면 화면을 채울 때
  판정을 다시 짜지 않는다. 판정은 canAccess("rules") 하나가 한다.
*/

export const metadata: Metadata = {
  title: "규칙",
};

export default async function Page() {
  const { access } = await guardPage("rules", "/rules");

  return (
    <Scaffold
      title="규칙"
      purpose="심사 기준을 시즌 시작 전에 전부 공개한다. 정량 심사의 유일한 방어선이다."
      locked={access.ok ? undefined : access.message}
      elements={[
        "점수 산식·가중치·상한을 숫자까지",
        "게이트 통과 기준",
        "실격 사유와 소명 절차",
        "규칙 버전 — 시즌 중에는 바꾸지 않는다",
      ]}
      blockedBy="점수 가중치·상한·통과선이 아직 정해지지 않았습니다. 산식 파라미터는 seasons.scoring_config에서 읽어 그립니다 — 화면에 적은 값과 실제 채점값이 달라지면 안 되기 때문입니다."
    />
  );
}
