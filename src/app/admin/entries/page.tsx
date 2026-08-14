import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/EmptyState";
import { EntryStatus } from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import { loadAdminEntries } from "@/lib/admin-read";

import { EntryActions } from "./EntryRow";

import styles from "./entries.module.css";

/*
  참가팀 관리 — PLN3 2장 「누가 어디까지 왔고 지금 살아 있는가」.

  실격·복구가 여기서 일어난다. 그래서 **한 줄에 판단 재료를 다 둔다** — 진도,
  생존 상태, 배포 여부, 제출 수. 화면을 옮겨 다니며 맞춰보게 하면 근거를 덜 보고
  누르게 된다.

  ⚠️ 실명은 읽지 않는다(admin-read.ts 머리 주석). 팀명과 인원 수까지다.
*/

export const metadata: Metadata = {
  title: "참가팀 관리",
  robots: { index: false, follow: false },
};

const DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
});

const STATUS_LABEL: Record<string, string> = {
  [EntryStatus.active]: "진행 중",
  [EntryStatus.eliminated]: "탈락",
  [EntryStatus.disqualified]: "실격",
  [EntryStatus.withdrawn]: "자진 포기",
};

export default async function Page() {
  const { viewer } = await guardPage("adminEntries", "/admin/entries");
  const rows = viewer.season ? await loadAdminEntries(viewer.season.id) : [];

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>참가팀</h1>
        <p className={styles.sub}>
          {rows.length}팀 · 상태 변경은 사유를 남겨야 처리되고 감사 로그에
          기록됩니다.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="아직 참가팀이 없습니다"
          detail="모집이 열리고 신청이 접수되면 여기에 쌓입니다."
        />
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.id} className={styles.item}>
              <div className={styles.main}>
                <p className={styles.team}>
                  {row.teamName}
                  <span className={styles.members}>{row.memberCount}인</span>
                  <span className={styles.status} data-status={row.status}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                </p>
                <p className={styles.idea}>{row.ideaTitle}</p>
                <p className={styles.facts}>
                  <span>진도 {row.stage}</span>
                  <span>제출 {row.submissions}건</span>
                  <span>{row.deployed ? "배포 확인" : "미배포"}</span>
                  <span>
                    {row.chargeType === "payment" ? "결제형" : "문의형"}
                  </span>
                  {row.appliedAt ? (
                    <span>{DATE.format(row.appliedAt)} 신청</span>
                  ) : null}
                  {/*
                    참가작 공개 페이지로 잇는다 — 운영이 판단할 때 실제 화면을
                    보지 않고 결정하면 그게 곧 오판이 된다.
                  */}
                  <Link href={`/projects/${row.id}`} className={styles.link}>
                    공개 페이지
                  </Link>
                </p>
              </div>

              <EntryActions entryId={row.id} status={row.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
