import type { Metadata } from "next";

import { AnchorButton } from "@/components/Button";
import { Card } from "@/components/Surface";
import { guardPage } from "@/lib/access";
import { maskEmail } from "@/lib/admin";
import { loadAdminLeads } from "@/lib/admin-read";
import { devNow } from "@/lib/dev-clock";
import { fmtMD } from "@/lib/header-state";

import hub from "../../dashboard/hub.module.css";
import c from "../console.module.css";

/*
  사전신청 리드 — 시안 `#scr-adm-leads`(3109행). KPI 1번 관측 지점.

  ⚠️ **주소는 가려서 보인다**(시안 「y***@g***.com」). 주소 전체가 필요한 일(모집
  오픈 알림 발송)은 「CSV 내보내기」로 한다 — 내려받기는 감사 로그에 남는다
  (`export/route.ts`). 한때 「내려받기를 일부러 만들지 않는다」고 적어 두었는데
  시안이 CSV를 정했다(옛 판단보다 시안이 나중이다).

  수신거부한 사람도 지우지 않고 마케팅 칸을 「-」로 적는다 — 지우면 같은 주소로
  다시 보낼 수 있게 되어 수신거부의 뜻이 사라진다(운영규칙 제24조 ②).
*/

export const metadata: Metadata = {
  title: "사전신청 리드",
  robots: { index: false, follow: false },
};

const NUM = new Intl.NumberFormat("ko-KR");

export default async function Page() {
  const { viewer } = await guardPage("adminLeads", "/admin/leads");
  const data = viewer.season
    ? await loadAdminLeads(viewer.season, devNow())
    : { rows: [], total: 0, todayCount: 0, optIn: 0 };
  const rate = data.total ? Math.round((data.optIn / data.total) * 100) : 0;

  return (
    <>
      <h2 className={hub.h1}>사전신청 리드</h2>
      <p className={hub.sub} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        KPI 1번 관측 지점{" "}
        <AnchorButton
          href="/admin/leads/export"
          variant="outline"
          style={{ marginLeft: "auto", padding: "8px 16px", fontSize: "13px" }}
        >
          CSV 내보내기
        </AnchorButton>
      </p>

      <div className={c.kpi} style={{ gridTemplateColumns: "repeat(3,1fr)" }} data-probe="leads-kpi">
        <Card>
          <small>누적 리드</small>
          <span className="score">{NUM.format(data.total)}</span>
        </Card>
        <Card>
          <small>오늘</small>
          <span className="score" style={{ color: "var(--accent)" }}>
            +{NUM.format(data.todayCount)}
          </span>
        </Card>
        <Card>
          <small>마케팅 동의율</small>
          <span className="score">{rate}%</span>
        </Card>
      </div>

      <table className={c.atbl} data-probe="leads">
        <thead>
          <tr>
            <th>EMAIL</th>
            <th>동의</th>
            <th>유입일</th>
            <th>UTM</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.id}>
              <td className={c.num}>{maskEmail(row.email)}</td>
              <td>
                필수 ✓, 마케팅 {row.marketingOptIn && !row.unsubscribedAt ? "✓" : "-"}
              </td>
              <td className={c.num}>{fmtMD(row.createdAt)}</td>
              <td className={c.num}>{row.utmSource ?? row.sourceChannel ?? "direct"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.rows.length === 0 ? (
        <p style={{ fontSize: "12px", color: "var(--faint)", marginTop: "12px" }}>
          사전신청 없음. 랜딩의 이메일 폼으로 접수되면 여기에 쌓임.
        </p>
      ) : null}
    </>
  );
}
