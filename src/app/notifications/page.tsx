import type { Metadata } from "next";

import { Button } from "@/components/Button";
import { NOTI_HEAD } from "@/content/notifications";
import { guardPage } from "@/lib/access";
import { fmtMD } from "@/lib/header-state";
import { notiHref, notiTone } from "@/lib/notifications-view";
import { prisma } from "@/lib/prisma";

import hub from "../dashboard/hub.module.css";

import { markAllRead } from "./actions";

import styles from "./notifications.module.css";

/*
  알림센터 — 시안 ver4 `#scr-noti`.

    ① nt-list   유형 점 · 제목 · 한 줄 · 날짜 · 안 읽음 점, 읽은 행은 흐리게

  대시보드 크롬 안이다(`layout.tsx`가 대시보드 껍데기를 빌린다). 행의 점 색은
  `notifications.type`을 세 갈래로 접은 것(`notifications-view.ts`). 대조는
  `scripts/design-diff/noti.mjs`, 판은 개발 바 「알림센터」 줄이 심는다.

  시안과 일부러 다른 것(내가 정함, 2026-09-23, 수연 확인 대기):
    · 링크가 있는 알림은 행 전체가 링크다 — 누르면 읽음으로 두고 그리로 간다
      (`[id]/route.ts`). 시안에는 행을 누르는 동작이 없다.
    · 순서는 최신 순. 시안 목업의 순서는 날짜와 안 맞는다.
    · 채널·도달 결과(메일·도달·반송)를 더는 적지 않는다 — 시안에 자리가 없다.
      기록은 `notifications.delivery_status`에 그대로 남는다.
*/

export const metadata: Metadata = {
  title: "알림센터",
  robots: { index: false, follow: false },
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
            type: true,
            title: true,
            body: true,
            linkUrl: true,
            readAt: true,
            createdAt: true,
          },
        })
      : [];

  return (
    <div data-probe="noti" data-state={rows.length > 0 ? "list" : "empty"}>
      <div
        style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "4px" }}
      >
        <h2 className={hub.h1} style={{ margin: 0 }}>
          {NOTI_HEAD.title}
        </h2>
        {/* 폼은 상자를 안 만든다 — 버튼이 시안처럼 머리 줄의 flex 항목이다 */}
        <form action={markAllRead} style={{ display: "contents" }}>
          <Button
            type="submit"
            variant="ghost"
            style={{ marginLeft: "auto", fontSize: "13px" }}
          >
            {NOTI_HEAD.readAll}
          </Button>
        </form>
      </div>
      <p className={hub.sub}>{NOTI_HEAD.sub}</p>

      <div>
        {rows.map((row) => {
          const cls = [
            styles.nt,
            styles[notiTone(row.type)],
            row.readAt ? styles.read : "",
          ].join(" ");
          const inner = (
            <>
              <span className={styles.dt} />
              <span>
                <b>{row.title}</b>
                {row.body ? <p>{row.body}</p> : null}
              </span>
              <span className={styles.tm}>{fmtMD(row.createdAt)}</span>
              {row.readAt ? null : <span className={styles.un} />}
            </>
          );
          /* 프리페치가 읽음 처리를 부르면 안 되므로 `next/link`가 아니다 */
          return notiHref(row.linkUrl) ? (
            <a key={row.id} className={cls} href={`/notifications/${row.id}`}>
              {inner}
            </a>
          ) : (
            <div key={row.id} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
