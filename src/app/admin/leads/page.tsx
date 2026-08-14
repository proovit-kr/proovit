import type { Metadata } from "next";

import { EmptyState } from "@/components/EmptyState";
import { LeadStatus } from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import { loadAdminLeads } from "@/lib/admin-read";

import styles from "./leads.module.css";

/*
  사전신청 목록 — PLN3 2장 「모집 전 수집한 이메일」.

  ⚠️ **이메일이 그대로 보이는 화면이다.** 그래서 셋을 지켰다.
    ① 내려받기 기능을 만들지 않았다 — 파일로 나가는 순간 접근 통제가 끝난다
    ② 수신거부한 사람도 지우지 않고 표시만 한다 — 지우면 같은 주소로 다시
       보낼 수 있게 되어 수신거부의 뜻이 사라진다
    ③ 마케팅 동의 여부를 한 칸으로 둔다 — 발송 대상은 이 칸이 정하지, 목록에
       있다는 사실이 정하지 않는다(운영규칙 제24조 ②)

  읽기 전용이다. 상태 변경(연락함·전환됨)은 발송 도구가 붙을 때 함께 만든다 —
  지금 손으로 바꾸면 도구가 쓰는 값과 사람이 쓴 값이 섞인다.
*/

export const metadata: Metadata = {
  title: "사전신청",
  robots: { index: false, follow: false },
};

const WHEN = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS_LABEL: Record<string, string> = {
  [LeadStatus.new]: "신규",
  [LeadStatus.contacted]: "연락함",
  [LeadStatus.converted]: "전환됨",
  [LeadStatus.unsubscribed]: "수신거부",
};

export default async function Page() {
  const { viewer } = await guardPage("adminLeads", "/admin/leads");
  const { rows, total } = viewer.season
    ? await loadAdminLeads(viewer.season.id)
    : { rows: [], total: 0 };

  const optIn = rows.filter((row) => row.marketingOptIn).length;

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>사전신청</h1>
        <p className={styles.sub}>
          {total}건 · 최근 {rows.length}건을 보여줍니다. 마케팅 수신에 동의한
          사람은 이 중 {optIn}명이고, 광고성 발송은 그 사람들에게만 나갑니다.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="아직 사전신청이 없습니다"
          detail="랜딩의 이메일 폼으로 접수되면 여기에 쌓입니다."
        />
      ) : (
        <div className={styles.scroller}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">이메일</th>
                <th scope="col">상태</th>
                <th scope="col">마케팅</th>
                <th scope="col">유입</th>
                <th scope="col">접수</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className={styles.email}>
                    {row.email}
                  </th>
                  <td>{STATUS_LABEL[row.status] ?? row.status}</td>
                  <td>
                    {row.unsubscribedAt ? (
                      <span className={styles.off}>거부</span>
                    ) : row.marketingOptIn ? (
                      "동의"
                    ) : (
                      <span className={styles.off}>미동의</span>
                    )}
                  </td>
                  <td className={styles.source}>
                    {row.utmSource ?? row.sourceChannel ?? "직접"}
                  </td>
                  <td className={styles.when}>{WHEN.format(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
