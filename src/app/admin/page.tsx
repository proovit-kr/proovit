import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/Badge";
import { LinkButton } from "@/components/Button";
import { Card } from "@/components/Surface";
import { guardPage } from "@/lib/access";
import { devNow } from "@/lib/dev-clock";
import { loadAdminSummary, ROLLUP_LATE_MIN } from "@/lib/admin-read";
import { fmtDday, fmtStamp } from "@/lib/header-state";
import { rollupHealth, type RollupHealth } from "@/lib/race";

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

/*
  시안 부제는 「시즌 1, 자동 집계 정상, 마지막 롤업 6분 전」이다. 두 군데를 바꿨다
  (2026-09-26 수연 결정).
    · 「자동 집계」 → 「리더보드 롤업」. 카드 바로 위라 아래 네 숫자를 롤업한다는
      뜻으로 읽혔다. 카드는 열 때마다 DB에서 바로 세고, 롤업이 쓰는 것은 리더보드
      순위뿐이다.
    · 시즌명을 뺐다. 헤더의 시즌 셀렉트와 겹친다.

  롤업이 돌 때가 아니면(race.ts `rollupHealth`의 idle) 부제를 통째로 뺀다. 그동안
  마지막 롤업이 낡는 것은 지연이 아닌데, 시각만 보면 「지연」이 떴다.

  롤업이 돌아야 하는 때는 **가장 이른 레이스 시작**이다(2026-09-26 팀별 집계).
  레이스가 시작됐는데 한도가 지나도록 스냅샷이 없으면 그것도 지연이다. 「첫 롤업
  대기」·「첫 롤업 없음」은 시안에 없다 — 내가 정함(수연 확인 대기).

  시각은 진짜 지금이다 — 롤업 시각(`updated_at`)과 레이스 시작이 진짜 시각이다.

  지연이면 줄을 danger 색으로 칠한다(2026-09-26 수연 결정). 시안은 「정상」 한 판만
  그려 muted였고, 그대로 두면 멈춘 롤업이 정상과 같은 회색이라 눈에 안 띈다.
*/
function subline(health: RollupHealth): string | null {
  if (health.kind === "idle") return null;
  if (health.kind === "first") {
    return health.late ? "리더보드 롤업 지연, 첫 롤업 없음" : "리더보드 첫 롤업 대기";
  }
  return `리더보드 롤업 ${health.late ? "지연" : "정상"}, 마지막 ${health.minutes}분 전`;
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
  const health = rollupHealth({
    halted: summary.rollupHalted,
    firstRaceStartAt: summary.firstRaceStartAt,
    lastRollupAt: summary.lastRollupAt,
    now: new Date(),
    lateMinutes: ROLLUP_LATE_MIN,
  });
  const line = summary.season ? subline(health) : "시즌 없음";
  const late = health.kind !== "idle" && health.late;

  return (
    <>
      {/* 부제가 빠지면 카드까지의 간격을 제목이 대신 띄운다 */}
      <h2 className={hub.h1} style={line ? undefined : { marginBottom: "20px" }}>
        운영 대시보드
      </h2>
      {line && (
        <p
          className={hub.sub}
          style={{ marginBottom: "20px", color: late ? "var(--danger)" : undefined }}
        >
          {line}
        </p>
      )}

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
      {/*
        숫자와 추세 사이를 띄운다 — 시안은 붙어 있어 「14목표」처럼 한 낱말로 읽힌다
        (2026-09-23 수연 지시). 여백이 아니라 공백 문자인 것은 좁은 폭에서 추세가
        다음 줄로 넘어갈 때 공백은 사라지고 여백은 들여쓰기로 남기 때문이다.
      */}{" "}
      <span className={`${c.trend}${trend.up ? ` ${c.up}` : ""}`}>{trend.text}</span>
    </Card>
  );
}
