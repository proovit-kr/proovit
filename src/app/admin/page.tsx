import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/Badge";
import { LinkButton } from "@/components/Button";
import { Card } from "@/components/Surface";
import { guardPage } from "@/lib/access";
import { devNow } from "@/lib/dev-clock";
import { loadAdminSummary } from "@/lib/admin-read";
import { fmtDday, fmtStamp } from "@/lib/header-state";

import hub from "../dashboard/hub.module.css";
import c from "./console.module.css";

/*
  운영 대시보드 — 시안 `#scr-admin`(2969행).

  숫자만 보여주고 판단은 각 화면에서 한다. 여기서 실격·판정 버튼을 달지 않는 이유는
  **한 화면에서 목록을 안 보고 처리하면 근거를 안 보고 누르게 되기 때문**이다.
  KPI 카드도 시안대로 링크가 아니다 — 들어갈 곳은 사이드바에 있다.

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

/**
 * 롤업이 멈췄는지 — 주기(15분)를 두 번 넘기면 지연으로 본다.
 * 내가 정함(수연 확인 대기): 시안은 「정상」 한 판만 그렸다.
 */
const ROLLUP_LATE_MIN = 30;

function minutesAgo(at: Date): number {
  return Math.max(0, Math.round((Date.now() - at.getTime()) / 60_000));
}

/*
  시안 부제 「시즌 1, 자동 집계 정상, 마지막 롤업 6분 전」.
  롤업이 한 번도 안 돌았으면(레이스 전) 그렇다고 적는다 — 「정상」이라 쓰면 거짓이다.
*/
function subline(title: string, lastRollupAt: Date | null): string {
  if (!lastRollupAt) return `${title}, 롤업 전`;
  const m = minutesAgo(lastRollupAt);
  return `${title}, 자동 집계 ${m > ROLLUP_LATE_MIN ? "지연" : "정상"}, 마지막 롤업 ${m}분 전`;
}

/*
  「↑ 3.8% 이번 주」 — 최근 7일에 늘어난 몫을 그 전까지의 누적에 견준다.
  전 누적이 0이면 비율이 없으니 개수로 적는다(「↑ 2 이번 주」와 같은 꼴).
  늘지 않았으면 화살표 없이 적는다 — 내가 정함(수연 확인 대기).
*/
function growth(total: number, week: number): { text: string; up: boolean } {
  if (week <= 0) return { text: "변화 없음, 이번 주", up: false };
  const before = total - week;
  if (before <= 0) return { text: `↑ ${NUM.format(week)} 이번 주`, up: true };
  return { text: `↑ ${((week / before) * 100).toFixed(1)}% 이번 주`, up: true };
}

function added(week: number): { text: string; up: boolean } {
  return week > 0
    ? { text: `↑ ${NUM.format(week)} 이번 주`, up: true }
    : { text: "변화 없음, 이번 주", up: false };
}

export default async function Page() {
  const { viewer } = await guardPage("admin", "/admin");
  const summary = await loadAdminSummary(viewer.season?.id ?? null);
  const today = devNow();
  const gate = summary.nextGate;

  return (
    <>
      <h2 className={hub.h1}>운영 대시보드</h2>
      <p className={hub.sub} style={{ marginBottom: "20px" }}>
        {summary.season ? subline(summary.season.title, summary.lastRollupAt) : "시즌 없음"}
      </p>

      {/*
        시안 `.kpi` — 넉 장. 「사전 신청 리드」에 KPI 1이라 적는 것도 시안 그대로다.
        이 숫자가 이 시즌의 목표라 다른 셋과 급이 다르다는 것을 표시한다.
      */}
      <div className={c.kpi}>
        <Kpi
          label="사전 신청 리드, KPI 1"
          value={summary.leads.total}
          trend={growth(summary.leads.total, summary.leads.week)}
        />
        <Kpi
          label="참가팀"
          value={summary.entries.total}
          trend={{ text: "목표 20~40팀", up: false }}
        />
        <Kpi
          label="배포 완료 서비스"
          value={summary.deployed.total}
          trend={added(summary.deployed.week)}
        />
        <Kpi
          label="참가작 총 이용자"
          value={summary.visitors.total}
          trend={growth(summary.visitors.total, summary.visitors.week)}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "14px",
          marginBottom: "14px",
        }}
      >
        {/* 시안 「다음 게이트 배치」 */}
        <Card style={{ padding: "20px" }} data-probe="adm-gate">
          <b style={{ fontSize: "14px" }}>다음 게이트 배치</b>
          {gate ? (
            <>
              <p style={P}>
                GATE {gate.no}, {gate.stageKey} {gate.no}차 심사, 대상 {gate.targets}팀, 마감{" "}
                {gate.closesAt ? (
                  <span className="mono" style={{ color: "var(--violet)" }}>
                    {fmtDday(today, gate.closesAt)}
                  </span>
                ) : (
                  "일정 확정 전"
                )}
                , 판정 SLA 마감 후 48시간
              </p>
              <LinkButton
                href="/admin/judging"
                variant="outline"
                style={{
                  borderColor: "rgba(167,139,250,.55)",
                  color: "var(--violet)",
                  padding: "8px 16px",
                  fontSize: "13px",
                }}
              >
                심사 콘솔로 이동
              </LinkButton>
            </>
          ) : (
            /* 게이트가 없다 = 시즌 전이거나 둘 다 끝났다. 빈 카드로 두지 않는다 */
            <p style={P}>예정된 게이트 없음. 시즌 일정이 잡히면 여기에 표시됨.</p>
          )}
        </Card>

        {/* 시안 「검토 대기 플래그」 */}
        <Card style={{ padding: "20px" }} data-probe="adm-flags">
          <b style={{ fontSize: "14px" }}>검토 대기 플래그</b>
          <p style={P}>
            지표 검토 <b className="mono">{summary.openMetricFlags}</b>건, 어뷰징{" "}
            <b className="mono">{summary.openAbuseFlags}</b>건, 소명{" "}
            <b className="mono">{summary.openAppeals}</b>건
          </p>
          <Badge tone="warn">전 팀 수동 검증 아님, 플래그만 처리</Badge>
        </Card>
      </div>

      {/* 시안 `.minlog` — 최근 다섯 줄 */}
      <Card style={{ padding: "20px" }} data-probe="adm-log">
        <div style={{ display: "flex", alignItems: "center", marginBottom: "6px" }}>
          <b style={{ fontSize: "14px" }}>최근 감사 로그</b>
          <Link
            href="/admin/audit-logs"
            className="mono"
            style={{ marginLeft: "auto", fontSize: "11.5px", color: "var(--muted)" }}
          >
            전체 보기 →
          </Link>
        </div>
        {summary.recentAudit.length === 0 ? (
          <p style={P}>기록 없음.</p>
        ) : (
          <div className={c.minlog}>
            {summary.recentAudit.map((row) => (
              <div key={row.id}>
                <span className={c.t}>{fmtStamp(row.at)}</span>
                <span>
                  {[
                    row.action,
                    [row.target, row.change].filter(Boolean).join(" "),
                    `사유: ${row.reason}`,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

/* 카드 본문 한 줄 — 시안 인라인 style 그대로 */
const P = { fontSize: "13px", color: "var(--muted)", margin: "6px 0 12px" } as const;

function Kpi({
  label,
  value,
  trend,
}: {
  label: string;
  value: number;
  trend: { text: string; up: boolean };
}) {
  return (
    <Card>
      <small>{label}</small>
      <span className="score">{NUM.format(value)}</span>
      <span className={`${c.trend}${trend.up ? ` ${c.up}` : ""}`}>{trend.text}</span>
    </Card>
  );
}
