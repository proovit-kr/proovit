import type { Metadata } from "next";

import { Badge } from "@/components/Badge";
import { Chip } from "@/components/Surface";
import { guardPage } from "@/lib/access";
import { fmtStamp } from "@/lib/header-state";

import hub from "../../dashboard/hub.module.css";
import c from "../console.module.css";
import { loadAwardBoard } from "./awards-read";
import { FinalizeButton } from "./FinalizeButton";

/*
  시상 — 시안 `#scr-adm-awards`(3203행). 최종 순위를 확정하고 수상을 발표한다.

  ⚠️ **화면이 순위를 만들지 않는다.** 표의 순위는 롤업이 쓴 `leaderboard_snapshots`를
  그대로 읽은 것이고(awards-read.ts), 이 화면이 하는 일은 그 값을 **확정**하는 것
  하나다. 확정하면 공개 리더보드가 FINAL로 바뀐다.

  ⚠️ 상태가 둘이다 — 데이터가 가른다.
    ① 드래프트  확정 버튼이 열려 있고 「수상」 칸은 순위로 계산한 제안값이다
    ② 확정 완료  버튼 자리에 확정 시각 칩이 선다(시안에 없는 판, 내가 정함)

  ⚠️ 제재로 빠진 팀을 지우지 않는다. 줄을 긋고 제재를 같이 적는다 — 확정을 누르기
  전에 「왜 빠졌는지」가 같은 화면에 있어야 한다.
*/

export const metadata: Metadata = {
  title: "시상",
  robots: { index: false, follow: false },
};

const NUM = new Intl.NumberFormat("ko-KR");

export default async function Page() {
  const { viewer } = await guardPage("adminAwards", "/admin/awards");
  const board = viewer.season
    ? await loadAwardBoard(viewer.season.id)
    : { snapshotDate: null, isFinal: false, finalizedAt: null, rows: [] };

  return (
    <>
      <h2 className={hub.h1}>시상</h2>
      <div className={`${hub.wbar} ${hub.wbarWarn}`} style={{ marginTop: "4px" }}>
        시즌1은 상금 지급 없음, 순위와 시상 발표까지
      </div>

      {board.rows.length === 0 ? (
        <p style={{ fontSize: "12px", color: "var(--faint)" }}>
          확정할 집계 없음. 롤업이 순위를 한 번이라도 집계하면 표가 생김.
        </p>
      ) : (
        <>
          <div
            style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}
            data-probe="awards-bar"
          >
            {board.isFinal ? (
              <Chip>
                FINAL 확정 완료{board.finalizedAt ? `, ${fmtStamp(board.finalizedAt)}` : ""}
              </Chip>
            ) : (
              <>
                <Chip>드래프트(확정 전)</Chip>
                {viewer.season ? <FinalizeButton seasonId={viewer.season.id} /> : null}
              </>
            )}
          </div>

          <table className={c.atbl} data-probe="awards">
            <thead>
              <tr>
                <th>RANK</th>
                <th>TEAM</th>
                <th>최종 지표</th>
                <th>제재 반영</th>
                <th>수상</th>
                <th>보증금 정산</th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row, i) => (
                <tr key={row.entryId} className={row.struck ? c.strike : undefined}>
                  <td className={c.num}>{row.rank === null ? "-" : String(row.rank).padStart(2, "0")}</td>
                  {row.struck ? (
                    <td className={c.tnm}>{row.teamName}</td>
                  ) : (
                    <td>
                      <b>{row.teamName}</b>
                    </td>
                  )}
                  <td className={c.num}>
                    {row.adjusted
                      ? `${NUM.format(row.visitors)} → ${NUM.format(row.visitors + row.adjusted)}`
                      : NUM.format(row.visitors)}
                  </td>
                  <td>
                    {row.sanction ? (
                      <Badge tone="warn">
                        {row.sanction.label}
                        {row.adjusted ? ` −${NUM.format(Math.abs(row.adjusted))}` : ""}
                      </Badge>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{row.award ? <Badge tone="lime">{row.award}</Badge> : "-"}</td>
                  {/* 보증금은 도입 미정이다 — 첫 줄에만 적는다(시안) */}
                  <td style={{ color: "var(--faint)" }}>{i === 0 ? "- 도입 미정" : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ fontSize: "12px", color: "var(--faint)", marginTop: "12px" }}>
            {board.isFinal
              ? "확정된 순위, 공개 리더보드 FINAL 전환 완료. 정정은 이의신청 절차."
              : "확정 시 공개 리더보드가 FINAL로 전환되며 되돌릴 수 없음."}
          </p>
        </>
      )}
    </>
  );
}
