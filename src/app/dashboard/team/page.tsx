import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { canManageTeam, guardPage, toAccessContext } from "@/lib/access";
import { inviteUrl, MAX_TEAM_SIZE } from "@/lib/team";
import { loadTeamPanel } from "@/lib/team-store";

import { TeamPanel } from "./TeamPanel";

import styles from "./team.module.css";

/*
  팀 관리 — PLN3 화면정의서 2장 「초대 코드 발급·취소 · 합류 처리 · 강퇴·본인 탈퇴 ·
  팀장 이양」.

  **보기는 팀원도 하고 쓰기는 팀장만 한다.** 라우트 정책에 leaderOnly를 걸면
  FORBIDDEN이 404로 덮여 팀원이 자기 팀조차 못 보므로, 쓰기 판정만
  `canManageTeam()`으로 갈랐다(access-policy.ts).

  ⚠️ 「합류 처리」는 이 화면에 못 둔다 — 초대받은 사람은 아직 참가 기록이 없어
  `canAccess("dashboardTeam")`이 404를 낸다. 그래서 코드를 넣는 자리는 `/apply`다.
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
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>{panel.name}</h1>
        <p className={styles.purpose}>
          팀은 최대 {MAX_TEAM_SIZE}명입니다. 제출과 팀 관리는 팀장만 할 수 있고,
          지표와 심사 결과는 팀원도 함께 봅니다.
        </p>
        {!access.ok ? (
          <p className={styles.locked}>{access.message}</p>
        ) : !manage.ok ? (
          <p className={styles.locked}>{manage.message}</p>
        ) : null}
      </header>

      <TeamPanel
        members={panel.members.map((member) => ({
          ...member,
          joinedAt: DATE.format(member.joinedAt),
        }))}
        invite={
          panel.invite
            ? {
                id: panel.invite.id,
                code: panel.invite.code,
                email: panel.invite.email,
                expiresAt: DATE.format(panel.invite.expiresAt),
                url: inviteUrl(panel.invite.code),
              }
            : null
        }
        full={panel.full}
        canManage={access.ok && manage.ok}
        viewerId={viewer.user.id}
        viewerIsLeader={viewer.team.isLeader}
      />
    </section>
  );
}
