"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { Input } from "@/components/Field";

import c from "../console.module.css";
import { ReasonModal } from "../ReasonModal";
import { reviewMetric, type ReviewState } from "./actions";

/*
  집계 한 줄의 판정 — 시안 `#scr-adm-metrics`의 세 버튼. 셋 다 `btn-ghost`이고
  이관만 danger 색이다 — 셋 중 하나가 크면 그게 기본값처럼 보인다. 누르면 사유
  모달(`#mdl-reason`)이 뜬다.

  재계산만 숫자를 하나 더 받는다(보정한 유효 방문 수). 시안 모달에는 그 칸이 없어
  모달에 얹었다(내가 정함, 수연 확인 대기).
*/

const INITIAL: ReviewState = {};

type Kind = "confirm" | "recalc" | "escalate";

export function ReviewActions({
  rowId,
  teamName,
  rawVisitors,
}: {
  rowId: string;
  teamName: string;
  /** 보정값 상한 — 원시보다 큰 값은 서버가 막는다 */
  rawVisitors: number;
}) {
  const [state, action, pending] = useActionState(reviewMetric, INITIAL);
  const [open, setOpen] = useState<Kind | null>(null);

  /* 처리되면 줄이 큐에서 내려간다(서버가 다시 그린다). 모달만 닫는다 */
  const [seen, setSeen] = useState(state.done);
  if (seen !== state.done) {
    setSeen(state.done);
    setOpen(null);
  }

  return (
    <>
      <Button type="button" variant="ghost" className={c.tblBtn} onClick={() => setOpen("confirm")}>
        확정
      </Button>
      <Button type="button" variant="ghost" className={c.tblBtn} onClick={() => setOpen("recalc")}>
        재계산
      </Button>
      <Button
        type="button"
        variant="ghost"
        className={c.tblBtn}
        style={{ color: "var(--danger)" }}
        onClick={() => setOpen("escalate")}
      >
        어뷰징 이관
      </Button>
      <ReasonModal
        open={open !== null}
        onClose={() => setOpen(null)}
        action={action}
        pending={pending}
        message={state.message}
        fields={{ rowId, kind: open ?? "" }}
        extra={
          open === "recalc" ? (
            <Input
              name="adjusted"
              type="number"
              min={0}
              max={rawVisitors}
              inputMode="numeric"
              placeholder={`보정 유효 방문 수 (원시 ${rawVisitors} 이하)`}
              aria-label={`${teamName} 보정 유효 방문 수`}
              style={{ marginTop: "12px" }}
            />
          ) : null
        }
      />
    </>
  );
}
