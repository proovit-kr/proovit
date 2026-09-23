import type { Metadata } from "next";

import { guardPage } from "@/lib/access";
import { fmtStamp } from "@/lib/header-state";
import { loadNoticeTeams, loadSentNotices } from "@/lib/notify-store";
import { prisma } from "@/lib/prisma";

import hub from "../../dashboard/hub.module.css";
import { NoticePanel } from "./NoticePanel";

/*
  공지 발송 — 시안 `#scr-adm-noti`(3154행).

  ⚠️ **시즌 이행 통지 전용이다.** 규칙 제24조가 이행 통지와 광고성 정보를 갈라놨고,
  광고성은 사전 동의자에게만 (광고) 표기·수신거부 방법과 함께 보내야 한다.
  그 장치가 없는 채로 버튼만 만들면 운영자가 광고를 이 창구로 보내게 된다
  (notify-store.ts 머리 주석).

  한때 있던 「링크」 칸은 시안에 없어 뺐다 — 공지는 알림센터에서 읽는 글이다.
*/

export const metadata: Metadata = {
  title: "공지 발송",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { viewer } = await guardPage("adminNotifications", "/admin/notifications");
  const seasonId = viewer.season?.id;

  const [teams, tracks, sent] = await Promise.all([
    seasonId ? loadNoticeTeams(seasonId) : [],
    seasonId
      ? prisma.track.findMany({ where: { seasonId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } })
      : [],
    loadSentNotices(),
  ]);

  return (
    <>
      {/* 본문 폭 720 — admin.module.css `.body:has(> [data-body="narrow"])` */}
      <span data-body="narrow" hidden />
      <h2 className={hub.h1}>공지 발송</h2>
      <p className={hub.sub}>대상 필터 broadcast, 발송 전 확인 필수</p>

      <NoticePanel
        teams={teams.map((t) => ({
          stage: t.stage,
          active: t.active,
          trackId: t.trackId,
          people: t.members.length,
        }))}
        /* 트랙 행이 없으면 시즌 1의 단일 트랙이다(schema Track 주석) */
        tracks={tracks.length ? tracks : [{ id: "none", name: "자유 주제" }]}
        sent={sent.map((s) => ({ ...s, sentAt: fmtStamp(s.sentAt) }))}
      />
    </>
  );
}
