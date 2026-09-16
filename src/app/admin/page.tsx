import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/Badge";
import { guardPage } from "@/lib/access";
import { loadAdminSummary } from "@/lib/admin-read";

import styles from "./admin.module.css";

/*
  운영 대시보드 — 시안 `#scr-admin`.

  숫자만 보여주고 판단은 각 화면에서 한다. 여기서 실격·판정 버튼을 달지 않는 이유는
  **한 화면에서 목록을 안 보고 처리하면 근거를 안 보고 누르게 되기 때문**이다.

  ⚠️ 0을 숨기지 않는다. 「심사 대기 0」과 「심사 화면을 안 만들었다」는 다른 상태이고,
  운영자는 그 둘을 구분해야 한다.

  ⚠️ 어투가 다른 화면과 다르다 — 시안 상태 바가 「어투 명사형, 예외만 처리하는
  콘솔」이라 적었다. 참가자 화면의 해요체를 여기 가져오지 않는다.
*/

export const metadata: Metadata = {
  title: "운영 대시보드",
  robots: { index: false, follow: false },
};

const NUM = new Intl.NumberFormat("ko-KR");

const DATETIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/*
  마감까지 남은 날 — 시안의 `D-3`. 날짜 경계로 센다(시각 차가 아니라).
  운영이 「오늘 기준 며칠」로 말하기 때문이다.
*/
function dday(closesAt: Date, today: Date): string {
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const b = Date.UTC(
    closesAt.getFullYear(),
    closesAt.getMonth(),
    closesAt.getDate(),
  );
  const days = Math.round((b - a) / 864e5);
  if (days === 0) return "D-DAY";
  return days > 0 ? `D-${days}` : `D+${-days}`;
}

export default async function Page() {
  await guardPage("admin", "/admin");
  const summary = await loadAdminSummary();
  const today = new Date();

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>운영 대시보드</h1>
        <p className={styles.sub}>
          {summary.season
            ? `${summary.season.title}, 페이즈 ${summary.season.phase}`
            : "시즌 없음"}
        </p>
      </header>

      {/*
        시안 `.kpi` — 넉 장. 「사전 신청 리드」에 KPI 1이라 적는 것도 시안 그대로다.
        이 숫자가 이 시즌의 목표라 다른 셋과 급이 다르다는 것을 표시한다.
      */}
      <dl className={styles.kpi}>
        <Kpi
          label="사전 신청 리드, KPI 1"
          value={NUM.format(summary.leads.total)}
          href="/admin/leads"
        />
        <Kpi
          label="참가팀"
          value={NUM.format(summary.entries.total)}
          trend="목표 20~40팀"
          href="/admin/entries"
        />
        <Kpi
          label="배포 완료 서비스"
          value={NUM.format(summary.deployedEntries)}
        />
        <Kpi
          label="참가작 총 이용자"
          value={NUM.format(summary.totalVisitors)}
        />
      </dl>

      <div className={styles.pair}>
        {/* 시안 「다음 게이트 배치」 */}
        <div className={styles.card}>
          <b className={styles.cardTitle}>다음 게이트 배치</b>
          {summary.nextGate ? (
            <>
              <p className={styles.cardBody}>
                {summary.nextGate.stageKey.toUpperCase()}{" "}
                {summary.nextGate.name}, 대상 {summary.nextGate.targets}팀
                {summary.nextGate.closesAt ? (
                  <>
                    , 마감{" "}
                    <span className={styles.dday}>
                      {dday(summary.nextGate.closesAt, today)}
                    </span>
                  </>
                ) : (
                  ", 일정 확정 전"
                )}
                , 판정 SLA 마감 후 48시간
              </p>
              <Link href="/admin/judging" className={styles.cardCta}>
                심사 콘솔로 이동
              </Link>
            </>
          ) : (
            /* 게이트가 없다 = 시즌 전이거나 둘 다 끝났다. 빈 카드로 두지 않는다 */
            <p className={styles.cardBody}>
              예정된 게이트 없음. 시즌 일정이 잡히면 여기에 표시됨.
            </p>
          )}
        </div>

        {/* 시안 「검토 대기 플래그」 */}
        <div className={styles.card}>
          <b className={styles.cardTitle}>검토 대기 플래그</b>
          <p className={styles.cardBody}>
            지표 검토 <b className={styles.num}>{summary.openMetricFlags}</b>건,
            어뷰징 <b className={styles.num}>{summary.openAbuseFlags}</b>건, 소명{" "}
            <b className={styles.num}>{summary.openAppeals}</b>건
          </p>
          <Badge tone="warn">전 팀 수동 검증 아님, 플래그만 처리</Badge>
        </div>
      </div>

      {/* 시안 `.minlog` — 최근 다섯 줄 */}
      <div className={styles.card}>
        <div className={styles.logHead}>
          <b className={styles.cardTitle}>최근 감사 로그</b>
          <Link href="/admin/audit-logs" className={styles.logAll}>
            전체 보기 →
          </Link>
        </div>
        {summary.recentAudit.length === 0 ? (
          <p className={styles.cardBody}>기록 없음.</p>
        ) : (
          <div className={styles.minlog}>
            {summary.recentAudit.map((row) => (
              <div key={row.id}>
                <span className={styles.logAt}>{DATETIME.format(row.at)}</span>
                <span>
                  {row.action}, 사유: {row.reason}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  trend,
  href,
}: {
  label: string;
  value: string;
  trend?: string;
  href?: string;
}) {
  const body = (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {trend ? <span className={styles.trend}>{trend}</span> : null}
    </>
  );
  return href ? (
    <Link href={href} className={`${styles.kpiCard} ${styles.kpiLink}`}>
      {body}
    </Link>
  ) : (
    <div className={styles.kpiCard}>{body}</div>
  );
}
