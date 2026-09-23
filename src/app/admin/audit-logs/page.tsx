import type { Metadata } from "next";

import { guardPage } from "@/lib/access";
import { AUDIT_ACTION_GROUPS, loadAuditPage } from "@/lib/admin-read";
import { devNow } from "@/lib/dev-clock";
import { fmtStamp } from "@/lib/header-state";

import hub from "../../dashboard/hub.module.css";
import c from "../console.module.css";
import { FilterBar } from "../FilterBar";

/*
  감사 로그 — 시안 `#scr-adm-audit`(3180행). 「누가 무엇을 왜 바꿨는가」.

  읽기 전용이고 **앞으로도 읽기 전용이다.** 지우거나 고치는 기능을 만들지 않는다 —
  고칠 수 있는 기록은 근거가 못 된다.

  ⚠️ 사유를 목록에서 접지 않는다(시안도 굵게 펼쳐 둔다). 이 화면을 여는 이유가
  사유를 읽으려는 것이다. meta(JSON)는 시안에 없어 화면에 올리지 않는다 — 대상과
  바뀐 값은 `loadAuditLines`가 읽어 대상 칸에 붙인다.
*/

export const metadata: Metadata = {
  title: "감사 로그",
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { viewer } = await guardPage("adminAuditLogs", "/admin/audit-logs");
  const sp = await searchParams;
  const { rows, actors } = await loadAuditPage(
    { period: sp.period, actor: sp.actor, action: sp.action },
    viewer.season,
    devNow(),
  );

  return (
    <>
      <h2 className={hub.h1}>감사 로그</h2>
      <p className={hub.sub}>운영자 쓰기 작업 전량 기록, 사유 필수</p>

      <FilterBar
        selects={[
          {
            name: "period",
            label: "기간",
            options: [
              { value: "", label: "기간, 최근 30일" },
              { value: "season", label: "기간, 시즌 전체" },
            ],
          },
          {
            name: "actor",
            label: "운영자",
            options: [
              { value: "", label: "운영자, 전체" },
              ...actors.map((a) => ({ value: a.id, label: a.name })),
              { value: "system", label: "system" },
            ],
          },
          {
            name: "action",
            label: "액션",
            options: [
              { value: "", label: "액션, 전체" },
              ...AUDIT_ACTION_GROUPS.map((g) => ({ value: g, label: `${g}.*` })),
            ],
          },
        ]}
      />

      <table className={c.atbl} data-probe="audit">
        <thead>
          <tr>
            <th>시각</th>
            <th>운영자</th>
            <th>액션</th>
            <th>대상</th>
            <th>사유</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className={c.num}>{fmtStamp(row.at)}</td>
              <td className={c.num}>{row.actor}</td>
              <td className={c.num}>{row.action}</td>
              <td>{row.target ?? "-"}</td>
              <td>
                <b>{row.reason}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p style={{ fontSize: "12px", color: "var(--faint)", marginTop: "12px" }}>
          조건에 맞는 기록 없음.
        </p>
      ) : null}
    </>
  );
}
