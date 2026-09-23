"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Input } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { Chip } from "@/components/Surface";
import { FEEDBACK_MIN } from "@/lib/judging";

import c from "../console.module.css";
import { FilterBar } from "../FilterBar";
import { saveJudgments, type JudgingState } from "./actions";
import s from "./judging.module.css";

/*
  심사 표와 일괄 저장 — 시안 `.fbar` + `.atbl` + `#mdl-batch`.

  줄마다 판정·사유를 이 화면이 들고 있다가 「판정 일괄 저장」에서 한 번에 보낸다.
  보내는 줄은 **사유가 있고 저장된 값과 다른 것**뿐이다 — 시안 「사유가 비어 있는
  행은 저장되지 않아요」. 이미 판정한 줄도 고칠 수 있고, 고치면 새 판정이 붙는다
  (감사 로그 `judgment.update`, 시안 「통지 후 수정은 감사 로그에 남아요」).
*/

type Verdict = "pass" | "fail";
type Row = {
  entryId: string;
  teamName: string;
  submissionId: string | null;
  submittedAt: string | null;
  summary: string;
  judgment: { result: string; feedback: string | null } | null;
};

const INITIAL: JudgingState = {};

export function JudgingBoard({
  gateNo,
  gates,
  selected,
  sla,
  remaining,
  rows,
}: {
  gateNo: 1 | 2;
  gates: { value: string; label: string }[];
  selected: string;
  sla: string;
  remaining: number;
  rows: Row[];
}) {
  const [state, action, pending] = useActionState(saveJudgments, INITIAL);
  const [open, setOpen] = useState(false);

  /* 줄마다 들고 있는 값 — 저장된 판정이 있으면 그것에서 시작한다 */
  const initial = () =>
    Object.fromEntries(
      rows
        .filter((r) => r.submissionId)
        .map((r) => [
          r.submissionId!,
          {
            result: (r.judgment?.result === "fail" ? "fail" : "pass") as Verdict,
            feedback: r.judgment?.feedback ?? "",
          },
        ]),
    );
  const [draft, setDraft] = useState(initial);

  /* 저장되면 모달을 닫고 서버가 다시 그린 값으로 되맞춘다 — 렌더 중에 견준다 */
  const [seen, setSeen] = useState({ done: state.done, rows });
  if (seen.done !== state.done || seen.rows !== rows) {
    setSeen({ done: state.done, rows });
    if (seen.done !== state.done && !state.failed?.length) setOpen(false);
    if (seen.rows !== rows) setDraft(initial());
  }

  const changed = rows.filter((r) => {
    if (!r.submissionId) return false;
    const d = draft[r.submissionId];
    if (!d || !d.feedback.trim()) return false;
    return !r.judgment || r.judgment.result !== d.result || (r.judgment.feedback ?? "") !== d.feedback.trim();
  });
  const short = changed.filter((r) => draft[r.submissionId!].feedback.trim().length < FEEDBACK_MIN);
  const items = changed.map((r) => ({
    submissionId: r.submissionId!,
    result: draft[r.submissionId!].result,
    feedback: draft[r.submissionId!].feedback.trim(),
  }));
  const failedIds = new Set(state.failed?.map((f) => f.submissionId));

  return (
    <>
      <FilterBar
        style={{ alignItems: "center" }}
        selects={[{ name: "gate", label: "게이트", options: gates, value: selected }]}
      >
        <Chip style={{ marginLeft: "auto" }}>
          판정 SLA{" "}
          <b className="mono" style={{ color: "var(--text)" }}>
            {sla}
          </b>
          , 잔여 {remaining}팀
        </Chip>
        <Button type="button" variant="primary" onClick={() => setOpen(true)}>
          판정 일괄 저장
        </Button>
      </FilterBar>

      <table className={c.atbl} data-probe="judging">
        <thead>
          <tr>
            <th>TEAM</th>
            <th>제출</th>
            <th>제출 요약</th>
            <th>판정</th>
            <th>사유 (참가자 열람, 필수)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) =>
            r.submissionId ? (
              <tr key={r.entryId}>
                <td>
                  <b>{r.teamName}</b>
                </td>
                <td className={c.num}>{r.submittedAt}</td>
                <td>{r.summary}</td>
                <td>
                  <select
                    className={`${c.selMini} ${s.jv} ${s[draft[r.submissionId].result]}`}
                    aria-label={`${r.teamName} 판정`}
                    value={draft[r.submissionId].result}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        [r.submissionId!]: { ...d[r.submissionId!], result: e.target.value as Verdict },
                      }))
                    }
                  >
                    <option value="pass">pass</option>
                    <option value="fail">fail</option>
                  </select>
                </td>
                <td className={s.cell}>
                  <Input
                    className={s.rs}
                    aria-label={`${r.teamName} 사유`}
                    aria-invalid={failedIds.has(r.submissionId) || undefined}
                    value={draft[r.submissionId].feedback}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        [r.submissionId!]: { ...d[r.submissionId!], feedback: e.target.value },
                      }))
                    }
                  />
                </td>
              </tr>
            ) : (
              /* 내지 않고 마감을 넘겨 탈락한 팀 — 판정할 것이 없다 */
              <tr key={r.entryId} className={c.strike}>
                <td className={c.tnm}>{r.teamName}</td>
                <td className={c.num} style={{ color: "var(--danger)" }}>
                  미제출
                </td>
                <td>{r.summary}</td>
                <td>
                  <Badge tone="red">fail</Badge>
                </td>
                <td style={{ color: "var(--faint)" }}>크론 자동 처리, 사유 &quot;마감 미제출&quot;</td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`판정 ${items.length}건을 저장할까요?`}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              취소
            </Button>
            <form action={action}>
              <input type="hidden" name="items" value={JSON.stringify(items)} />
              <Button
                variant="primary"
                type="submit"
                disabled={pending || items.length === 0 || short.length > 0}
              >
                저장하고 통지
              </Button>
            </form>
          </>
        }
      >
        <p>
          저장 즉시 참가자에게 판정과 사유가 통지되고,{" "}
          {gateNo === 1 ? "pass 팀은 s3가 열려요." : "pass 팀은 완주로 기록돼요."} 사유가 비어
          있는 행은 저장되지 않아요.{" "}
          <b style={{ color: "var(--danger)" }}>통지 후 수정은 감사 로그에 남아요.</b>
        </p>
        {short.length ? (
          <p role="alert" style={{ marginTop: "10px", fontSize: "13px", color: "var(--danger)" }}>
            사유가 {FEEDBACK_MIN}자보다 짧은 줄: {short.map((r) => r.teamName).join(", ")}
          </p>
        ) : null}
        {state.message ? (
          <p role="alert" style={{ marginTop: "10px", fontSize: "13px", color: "var(--danger)" }}>
            {state.message}
          </p>
        ) : null}
      </Modal>
    </>
  );
}
