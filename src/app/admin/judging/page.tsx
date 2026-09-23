import type { Metadata } from "next";

import { guardPage } from "@/lib/access";
import { devNow } from "@/lib/dev-clock";
import { fmtMDHM, fmtStamp } from "@/lib/header-state";
import { loadJudgingBoard } from "@/lib/judging-store";

import hub from "../../dashboard/hub.module.css";
import { JudgingBoard } from "./JudgingBoard";

/*
  심사 — 시안 `#scr-adm-judging`(3065행).

  게이트 하나의 제출을 표로 놓고 줄마다 pass·fail과 사유를 적은 뒤 한 번에 저장한다.
  저장하면 팀원에게 판정 알림이 간다(judging-store `judgeSubmission`).

  ⚠️ **점수를 받지 않는다.** 시안 안내 「배점과 통과선은 내부 기준서 참조, 콘솔에
  배점 칸 없음」 그대로다 — 통과 컷은 규칙 제9조 ②가 비공개로 정한 값이다.
*/

export const metadata: Metadata = {
  title: "심사",
  robots: { index: false, follow: false },
};

/** 게이트 이름 — 시안 셀렉트의 선택지 */
const GATE_NAME: Record<number, string> = { 1: "1차 심사(사업성)", 2: "2차 심사(최종)" };

/** 판정 SLA — 마감 후 48시간(대시보드 「판정 SLA 마감 후 48시간」) */
const SLA_MS = 48 * 3_600_000;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { viewer } = await guardPage("adminJudging", "/admin/judging");
  const sp = await searchParams;
  const board = viewer.season
    ? await loadJudgingBoard(viewer.season.id, sp.gate, devNow())
    : null;

  return (
    <>
      <h2 className={hub.h1}>심사</h2>
      <p className={hub.sub}>
        시즌1 심사자는 admin 계정 전용, 운영진이 제출물을 직접 읽고 판정, AI 관여 없음,
        판정값은 pass와 fail 2값, 보완 없음. 콘솔은 결과와 사유만 받음
      </p>

      {board?.gate ? (
        <JudgingBoard
          key={board.gate.stageKey}
          gateNo={board.gate.no}
          gates={board.gates.map((g) => ({
            value: g.stageKey,
            label: `GATE ${g.no}, ${g.stageKey} ${GATE_NAME[g.no]}, 마감 ${
              g.closesAt ? fmtMDHM(g.closesAt) : "미정"
            }`,
          }))}
          selected={board.gate.stageKey}
          sla={board.gate.closesAt ? fmtMDHM(new Date(board.gate.closesAt.getTime() + SLA_MS)) : "미정"}
          remaining={board.remaining}
          rows={board.rows.map((r) => ({
            ...r,
            submittedAt: r.submittedAt ? fmtStamp(r.submittedAt) : null,
          }))}
        />
      ) : (
        <p style={{ fontSize: "12px", color: "var(--faint)" }}>게이트 없음. 시즌 관리에서 스테이지를 확인.</p>
      )}

      <p style={{ fontSize: "12px", color: "var(--faint)", marginTop: "12px" }}>
        사유 미입력 시 저장 불가. 판정과 사유는 참가자의 심사 결과 화면에 그대로 노출됨. 첫
        5팀은 2인 교차 채점. 배점과 통과선은 내부 기준서 참조, 콘솔에 배점 칸 없음. 전량 감사
        로그 기록.
      </p>
    </>
  );
}
