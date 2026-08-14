import type { Metadata } from "next";

import { EmptyState } from "@/components/EmptyState";
import { EntryStatus } from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import { loadSentNotices } from "@/lib/notify-store";
import { prisma } from "@/lib/prisma";

import { NoticeForm } from "./NoticeForm";

import styles from "./notifications.module.css";

/*
  공지 — PLN3 2장 「마감·심사 결과·제출 요청을 참가팀에게 알린다」.

  ⚠️ **시즌 이행 통지 전용이다.** 규칙 제24조가 이행 통지와 광고성 정보를 갈라놨고,
  광고성은 사전 동의자에게만 (광고) 표기·수신거부 방법과 함께 보내야 한다.
  그 장치가 없는 채로 버튼만 만들면 운영자가 광고를 이 창구로 보내게 된다
  (notify-store.ts 머리 주석).

  ⚠️ 지금은 인앱만 나간다. 메일은 도메인 확보, 알림톡은 발신프로필 심사가 선행이다 —
  없는 채널을 고르게 하면 "보냈다"고 믿게 된다.
*/

export const metadata: Metadata = {
  title: "공지",
  robots: { index: false, follow: false },
};

const WHEN = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function Page() {
  const { viewer } = await guardPage(
    "adminNotifications",
    "/admin/notifications",
  );

  const seasonId = viewer.season?.id;
  const [all, active, sent] = await Promise.all([
    seasonId
      ? prisma.teamMember.count({
          where: { team: { entries: { some: { seasonId } } } },
        })
      : 0,
    seasonId
      ? prisma.teamMember.count({
          where: {
            team: {
              entries: { some: { seasonId, status: EntryStatus.active } },
            },
          },
        })
      : 0,
    loadSentNotices(),
  ]);

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>공지</h1>
        <p className={styles.sub}>
          마감·심사 결과·제출 요청 같은 시즌 이행 통지를 보냅니다. 광고성 정보는
          이 창구로 보내지 않습니다(규칙 제24조). 지금은 인앱 알림으로만 나가고,
          메일·알림톡은 발송 경로가 붙은 뒤에 열립니다.
        </p>
      </header>

      <NoticeForm counts={{ all, active }} />

      <section className={styles.history}>
        <h2 className={styles.historyTitle}>보낸 공지</h2>
        {sent.length === 0 ? (
          <EmptyState
            title="보낸 공지가 없습니다"
            detail="보내면 받은 사람 수와 읽은 사람 수가 함께 남습니다."
          />
        ) : (
          <ul className={styles.list}>
            {sent.map((notice) => (
              <li
                key={`${notice.title}-${notice.sentAt?.toISOString()}`}
                className={styles.item}
              >
                <p className={styles.itemHead}>
                  <span className={styles.when}>
                    {notice.sentAt ? WHEN.format(notice.sentAt) : "발송 시각 없음"}
                  </span>
                  {/* 안 읽혔으면 다시 보낼지 판단해야 한다 — 그 재료가 이 숫자다 */}
                  <span className={styles.stat}>
                    {notice.count}명 중 {notice.readCount}명 읽음
                  </span>
                </p>
                <p className={styles.itemTitle}>{notice.title}</p>
                {notice.body ? (
                  <p className={styles.body}>{notice.body}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
