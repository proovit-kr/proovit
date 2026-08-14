import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { DeliveryStatus, NotifChannel } from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import { prisma } from "@/lib/prisma";

import { markRead } from "./actions";

import styles from "./notifications.module.css";

/*
  알림센터 — PLN3 2장 「마감·심사 결과·초대 알림을 모아 본다」.

  ⚠️ 지금은 **쌓이는 알림이 없다.** 발송이 아직 안 붙었다(메일은 도메인 확보,
  알림톡은 발신프로필 심사가 선행). 그래도 화면을 지금 만드는 이유는, 발송이
  붙는 순간 참가자가 인앱에서 확인할 자리가 있어야 하고 그 자리가 없으면
  "메일을 못 받았다"는 문의를 받을 곳이 없기 때문이다.

  ⚠️ 도달 결과(delivered/bounced)를 숨기지 않는다. 마감 통지 분쟁의 근거가
  그것이다(스키마 `notifications.delivery_status` 주석) — 참가자가 "안 왔다"고
  할 때 우리도 참가자도 같은 화면을 본다.
*/

export const metadata: Metadata = {
  title: "알림",
  robots: { index: false, follow: false },
};

const WHEN = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const CHANNEL_LABEL: Record<string, string> = {
  [NotifChannel.inapp]: "인앱",
  [NotifChannel.email]: "메일",
  [NotifChannel.alimtalk]: "알림톡",
};

const DELIVERY_LABEL: Record<string, string> = {
  [DeliveryStatus.queued]: "발송 대기",
  [DeliveryStatus.sent]: "발송함",
  [DeliveryStatus.delivered]: "도달",
  [DeliveryStatus.bounced]: "반송",
  [DeliveryStatus.failed]: "발송 실패",
};

export default async function Page() {
  const { viewer, access } = await guardPage("notifications", "/notifications");

  const rows =
    access.ok && viewer.user
      ? await prisma.notification.findMany({
          where: { userId: viewer.user.id },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            title: true,
            body: true,
            linkUrl: true,
            channel: true,
            deliveryStatus: true,
            readAt: true,
            createdAt: true,
          },
        })
      : [];

  const unread = rows.filter((row) => row.readAt === null).length;

  return (
    <main className={`page ${styles.page}`}>
      <div className={`container container--narrow grow ${styles.wrap}`}>
        <header className={styles.head}>
          <h1 className={styles.title}>알림</h1>
          <p className={styles.purpose}>
            마감·심사 결과·팀 초대를 여기 모아 둡니다. 중요한 통지는 메일로도
            보내드립니다.
          </p>
          {unread > 0 ? (
            <form action={markRead}>
              <input type="hidden" name="id" value="all" />
              <Button type="submit" variant="quiet" size="sm">
                {unread}건 모두 읽음
              </Button>
            </form>
          ) : null}
        </header>

        {rows.length === 0 ? (
          <EmptyState
            title="받은 알림이 없습니다"
            detail="시즌이 시작되면 스테이지 마감과 심사 결과를 여기로 보내드립니다. 알림 수신 방법은 설정에서 바꿀 수 있습니다."
            action={
              <Link href="/settings" className={styles.link}>
                알림 설정
              </Link>
            }
          />
        ) : (
          <ul className={styles.list}>
            {rows.map((row) => (
              <li
                key={row.id}
                className={row.readAt ? styles.itemRead : styles.item}
              >
                <div className={styles.itemHead}>
                  <span className={styles.when}>
                    {WHEN.format(row.createdAt)}
                  </span>
                  <span className={styles.meta}>
                    {CHANNEL_LABEL[row.channel] ?? row.channel}
                    {row.deliveryStatus ? (
                      <span className={styles.delivery}>
                        {DELIVERY_LABEL[row.deliveryStatus] ??
                          row.deliveryStatus}
                      </span>
                    ) : null}
                  </span>
                </div>

                <p className={styles.itemTitle}>{row.title}</p>
                {row.body ? <p className={styles.body}>{row.body}</p> : null}

                <div className={styles.itemActions}>
                  {row.linkUrl ? (
                    <Link href={row.linkUrl} className={styles.link}>
                      바로가기
                    </Link>
                  ) : null}
                  {row.readAt ? null : (
                    <form action={markRead}>
                      <input type="hidden" name="id" value={row.id} />
                      <Button type="submit" variant="quiet" size="sm">
                        읽음
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
