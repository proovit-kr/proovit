"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { REASON_MIN } from "@/lib/admin";

import { reviewMetric, type ReviewState } from "./actions";

import styles from "./metrics.module.css";

/*
  집계 한 줄의 판정.

  시안(`#scr-adm-metrics`)은 셋 다 같은 `btn-ghost`로 두고 이관만 danger 색을
  준다 — 셋 중 하나가 크면 그게 기본값처럼 보인다. 어느 쪽이든 사유를 적어야
  눌린다(`data-modal="mdl-reason"`).

  ⚠️ 모달 대신 그 자리에서 펼친다. 확인 모달은 「무엇을 판정 중인지」가 가려져서,
  사유를 적을 때 근거가 되는 숫자를 다시 못 본다. 어뷰징 판정(FlagActions)과
  같은 방식이다.
*/

const INITIAL: ReviewState = {};

const LABEL = {
  confirm: "확정",
  recalc: "재계산",
  escalate: "어뷰징 이관",
} as const;

type Kind = keyof typeof LABEL;

const HINT: Record<Kind, string> = {
  confirm: "자동 집계를 그대로 인정합니다. 값은 바뀌지 않습니다.",
  recalc: "유효 방문 수를 손으로 덮습니다. 이후 엣지 집계가 이 값을 덮지 않습니다.",
  escalate: "어뷰징 큐로 넘깁니다. 여기서 실격이 정해지지는 않습니다.",
};

export function ReviewActions({
  rowId,
  rawVisitors,
}: {
  rowId: string;
  /** 보정값 상한 — 원시보다 큰 값은 서버가 막는다 */
  rawVisitors: number;
}) {
  const [state, formAction, pending] = useActionState(reviewMetric, INITIAL);
  const [open, setOpen] = useState<Kind | null>(null);

  if (state.done) {
    return <p className={styles.settled}>처리됨</p>;
  }

  if (open === null) {
    return (
      <div className={styles.actions}>
        {state.message ? (
          <p className={styles.error} role="alert">
            {state.message}
          </p>
        ) : null}
        <div className={styles.buttons}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen("confirm")}
          >
            {LABEL.confirm}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen("recalc")}
          >
            {LABEL.recalc}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={styles.danger}
            onClick={() => setOpen("escalate")}
          >
            {LABEL.escalate}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="rowId" value={rowId} />
      <input type="hidden" name="kind" value={open} />

      <p className={styles.hint}>{HINT[open]}</p>

      {state.message ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      {open === "recalc" ? (
        <>
          <label className={styles.label} htmlFor={`adj-${rowId}`}>
            보정 유효 방문 수
          </label>
          <input
            id={`adj-${rowId}`}
            name="adjusted"
            className={styles.number}
            inputMode="numeric"
            max={rawVisitors}
            placeholder={`0 ~ ${rawVisitors}`}
          />
        </>
      ) : null}

      <label className={styles.label} htmlFor={`reason-${rowId}`}>
        {LABEL[open]} 사유
      </label>
      <textarea
        id={`reason-${rowId}`}
        name="reason"
        className={styles.reason}
        rows={2}
        minLength={REASON_MIN}
        placeholder="무엇을 근거로 판단했는지 적어 주세요. 참가자 문의의 답이 됩니다."
      />

      <div className={styles.buttons}>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "처리 중…" : "확인"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(null)}
        >
          취소
        </Button>
      </div>
    </form>
  );
}
