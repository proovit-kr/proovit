import type { Metadata } from "next";

import { EmptyState } from "@/components/EmptyState";
import { guardPage } from "@/lib/access";
import { prisma } from "@/lib/prisma";

import styles from "./audit-logs.module.css";

/*
  감사 로그 — PLN3 2장 「누가 무엇을 왜 바꿨는가」.

  읽기 전용이고 **앞으로도 읽기 전용이다.** 지우거나 고치는 기능을 만들지 않는다 —
  고칠 수 있는 기록은 근거가 못 된다. 스키마도 `id`가 autoincrement BigInt라
  순서가 그대로 보존된다.

  ⚠️ 사유(reason)를 목록에서 접지 않는다. 이 화면을 여는 이유가 사유를 읽으려는
  것이고, 펼쳐야 보이면 스크린샷에 안 담긴다.
*/

export const metadata: Metadata = {
  title: "감사 로그",
  robots: { index: false, follow: false },
};

const WHEN = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export default async function Page() {
  await guardPage("adminAuditLogs", "/admin/audit-logs");

  const rows = await prisma.auditLog.findMany({
    orderBy: { id: "desc" },
    take: 200,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      reason: true,
      meta: true,
      createdAt: true,
      /* 운영자는 닉네임으로 식별한다 — 실명은 이 화면에 필요 없다 */
      actor: { select: { nickname: true } },
    },
  });

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>감사 로그</h1>
        <p className={styles.sub}>
          운영자가 상태를 바꾼 기록입니다. 최근 200건을 보여주며, 이 화면에서
          지우거나 고칠 수 없습니다.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="기록이 없습니다"
          detail="참가 상태 변경이나 페이즈 전환이 일어나면 여기에 쌓입니다."
        />
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.id.toString()} className={styles.item}>
              <div className={styles.line}>
                <span className={styles.when}>{WHEN.format(row.createdAt)}</span>
                <span className={styles.action}>{row.action}</span>
                <span className={styles.actor}>
                  {row.actor?.nickname ?? "시스템"}
                </span>
              </div>
              <p className={styles.reason}>{row.reason}</p>
              <p className={styles.target}>
                {row.targetType}
                {row.targetId ? ` · ${row.targetId}` : null}
                {/* meta는 "무엇에서 무엇으로"라 그대로 보여주는 편이 읽힌다 */}
                {row.meta ? (
                  <span className={styles.meta}>{JSON.stringify(row.meta)}</span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
