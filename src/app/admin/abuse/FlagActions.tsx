"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { AbuseStatus } from "@/generated/prisma/enums";
import { REASON_MIN } from "@/lib/admin";

import { resolveFlag, type AbuseState } from "./actions";

import styles from "./abuse.module.css";

/*
  플래그 한 건의 판정.

  확정과 취소를 같은 크기로 둔다 — 확정 버튼만 크게 두면 "일단 확정"이 기본값처럼
  보인다. 어느 쪽이든 사유를 적어야 눌린다.
*/

const INITIAL: AbuseState = {};

export function FlagActions({
  flagId,
  status,
}: {
  flagId: string;
  status: string;
}) {
  const [state, formAction, pending] = useActionState(resolveFlag, INITIAL);
  const [open, setOpen] = useState<string | null>(null);

  /* 이미 판정이 끝난 건은 다시 누를 자리를 주지 않는다 */
  const settled =
    status === AbuseStatus.upheld || status === AbuseStatus.overturned;
  if (settled) return null;

  return (
    <div className={styles.actions}>
      {state.message ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      {open === null ? (
        <div className={styles.buttons}>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            onClick={() => setOpen(AbuseStatus.upheld)}
          >
            어뷰징 확정
          </Button>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            onClick={() => setOpen(AbuseStatus.overturned)}
          >
            플래그 취소
          </Button>
        </div>
      ) : (
        <form action={formAction} className={styles.form}>
          <input type="hidden" name="flagId" value={flagId} />
          <input type="hidden" name="status" value={open} />

          <label className={styles.label} htmlFor={`reason-${flagId}`}>
            {open === AbuseStatus.upheld ? "확정" : "취소"} 사유
          </label>
          <textarea
            id={`reason-${flagId}`}
            name="reason"
            className={styles.reason}
            rows={2}
            minLength={REASON_MIN}
            placeholder="무엇을 근거로 판단했는지 적어 주세요. 참가자 문의의 답이 됩니다."
          />

          {open === AbuseStatus.upheld ? (
            <>
              <label className={styles.label} htmlFor={`adj-${flagId}`}>
                조정 유효 방문 수 <span className={styles.optional}>선택</span>
              </label>
              <input
                id={`adj-${flagId}`}
                name="adjustedVisitors"
                className={styles.number}
                inputMode="numeric"
                placeholder="비우면 조정 없음"
              />
            </>
          ) : null}

          <div className={styles.buttons}>
            <Button type="submit" variant="soft" size="sm" disabled={pending}>
              {pending ? "처리 중…" : "확인"}
            </Button>
            <Button
              type="button"
              variant="quiet"
              size="sm"
              onClick={() => setOpen(null)}
            >
              취소
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
