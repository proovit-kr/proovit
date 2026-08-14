import type { Metadata } from "next";
import Link from "next/link";

import { guardPage } from "@/lib/access";
import { loadAdminSummary } from "@/lib/admin-read";

import styles from "./admin.module.css";

/*
  운영자 홈 — PLN3 2장 「지금 운영이 해야 할 일이 무엇인지」.

  숫자만 보여주고 판단은 각 화면에서 한다. 여기서 실격·판정 버튼을 달지 않는 이유는
  **한 화면에서 목록을 안 보고 처리하면 근거를 안 보고 누르게 되기 때문**이다.

  ⚠️ 0을 숨기지 않는다. 「심사 대기 0」과 「심사 화면을 안 만들었다」는 다른 상태이고,
  운영자는 그 둘을 구분해야 한다.
*/

export const metadata: Metadata = {
  title: "운영 홈",
  robots: { index: false, follow: false },
};

const NUM = new Intl.NumberFormat("ko-KR");

export default async function Page() {
  await guardPage("admin", "/admin");
  const summary = await loadAdminSummary();

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>운영 홈</h1>
        {summary.season ? (
          <p className={styles.sub}>
            {summary.season.title} · 페이즈 {summary.season.phase}
          </p>
        ) : (
          <p className={styles.sub}>시즌이 아직 없습니다.</p>
        )}
      </header>

      <dl className={styles.stats}>
        <Stat label="참가팀" value={NUM.format(summary.entries.total)} />
        <Stat label="진행 중" value={NUM.format(summary.entries.active)} />
        <Stat label="탈락" value={NUM.format(summary.entries.eliminated)} />
        <Stat label="실격" value={NUM.format(summary.entries.disqualified)} />
        <Stat
          label="심사 대기"
          value={NUM.format(summary.pendingJudgments)}
          href="/admin/judging"
        />
        <Stat
          label="어뷰징 미처리"
          value={NUM.format(summary.openAbuseFlags)}
          href="/admin/abuse"
        />
        <Stat
          label="사전신청"
          value={NUM.format(summary.leads.total)}
          href="/admin/leads"
        />
        <Stat label="수신거부" value={NUM.format(summary.leads.unsubscribed)} />
      </dl>

      <nav className={styles.links} aria-label="바로가기">
        <Link href="/admin/entries">참가팀 관리</Link>
        <Link href="/admin/seasons">시즌·페이즈</Link>
        <Link href="/admin/leads">사전신청 목록</Link>
        <Link href="/admin/audit-logs">감사 로그</Link>
      </nav>

      <p className={styles.note}>
        참가 상태 변경과 페이즈 전환은 사유를 남겨야 처리됩니다. 모든 변경은 감사
        로그에 기록됩니다.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
  return href ? (
    <Link href={href} className={styles.statLink}>
      {body}
    </Link>
  ) : (
    <div className={styles.stat}>{body}</div>
  );
}
