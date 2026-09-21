import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { canManageTeam, guardPage, toAccessContext } from "@/lib/access";
import { MAX_TEAM_SIZE } from "@/lib/team";
import { loadTeamPanel } from "@/lib/team-store";

import hub from "../hub.module.css";
import { TeamPanel } from "./TeamPanel";

/*
  팀 관리 — 시안 `#scr-team` 두 판(① 2인 팀 · ② 개인 참가).

  시안의 판은 뷰어 토글이지만 여기서는 **팀원 수가 판을 정한다** — 둘이면
  ①(요약·강퇴·이양), 혼자면 ②(요약·초대). 초대 코드 상자는 살아 있는 초대가
  있을 때만 선다(시안 ①이 코드 상자를 그리지만, 찬 팀에는 발급된 초대가 있을 수
  없어 우리 화면에서는 ②에서만 보인다).

  **보기는 팀원도 하고 쓰기는 팀장만 한다.** 라우트 정책에 leaderOnly를 걸면
  FORBIDDEN이 404로 덮여 팀원이 자기 팀조차 못 보므로, 쓰기 판정만
  `canManageTeam()`으로 갈랐다(access-policy.ts). 팀원에게는 시안에 없는
  「팀에서 나가기」 상자 하나만 더 선다.

  ⚠️ 「합류 처리」는 이 화면에 못 둔다 — 초대받은 사람은 아직 참가 기록이 없어
  `canAccess("dashboardTeam")`이 404를 낸다. 그래서 코드를 넣는 자리는 `/apply`다.

  머리(`.hb-h1`·`.hb-sub`)와 행동 상자(`.act`)·요약 카드(`.hb-sum`)는 참가자
  화면이 공유하는 시안 클래스라 hub.module.css의 것을 그대로 쓴다.
*/

export const metadata: Metadata = {
  title: "팀 관리",
  robots: { index: false, follow: false },
};

/* 서버에서 문자열로 만들어 내린다 — 클라이언트에서 포맷하면 하이드레이션이 어긋난다 */
const DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});

export default async function Page() {
  const { viewer, access } = await guardPage("dashboardTeam", "/dashboard/team");
  if (!viewer.team || !viewer.entry || !viewer.user) notFound();

  const panel = await loadTeamPanel(viewer.team.id);
  if (!panel) notFound();

  /* 화면이 폼을 그릴지 정하는 판정. 서버 액션이 같은 함수를 다시 부른다 */
  const manage = canManageTeam(toAccessContext(viewer));

  return (
    <>
      {/* 시안의 경고줄은 제목보다 위다(허브와 같은 자리) */}
      {!access.ok ? (
        <div className={`${hub.wbar} ${hub.wbarWarn}`} role="status">
          {access.message}
        </div>
      ) : null}

      <h2 className={hub.h1}>팀 관리</h2>
      <p className={hub.sub}>
        최대 {MAX_TEAM_SIZE}인이에요. 팀장만 초대, 강퇴, 이양을 할 수 있어요.
      </p>

      <TeamPanel
        teamName={panel.name}
        members={panel.members.map((member) => ({
          ...member,
          joinedAt: DATE.format(member.joinedAt),
        }))}
        invite={
          panel.invite
            ? {
                id: panel.invite.id,
                code: panel.invite.code,
                expiresAt: DATE.format(panel.invite.expiresAt),
              }
            : null
        }
        full={panel.full}
        canManage={access.ok && manage.ok}
        viewerId={viewer.user.id}
        viewerIsLeader={viewer.team.isLeader}
      />
    </>
  );
}
