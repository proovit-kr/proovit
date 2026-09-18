"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { REASON_MIN } from "@/lib/admin";

import { finalizeRanking, type FinalizeState } from "./actions";

import styles from "./awards.module.css";

/*
  순위 확정 버튼.

  ⚠️ 확인 모달을 반드시 거친다(Modal 머리 주석의 「되돌리기 어려운 것」 목록에
  순위 확정이 들어 있다). 버튼 하나로 공개 리더보드가 FINAL로 바뀌므로
  **무엇이 바뀌는지를 모달 본문에 적어 두고**, 사유를 채워야 실행 버튼이 열린다.
*/

const INITIAL: FinalizeState = {};

export function FinalizeButton({
  seasonId,
  winners,
}: {
  seasonId: string;
  /** 모달에서 「누가 받는지」를 다시 보여준다 */
  winners: { rank: number; teamName: string; award: string }[];
}) {
  const [state, formAction, pending] = useActionState(finalizeRanking, INITIAL);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const short = reason.trim().length < REASON_MIN;

  return (
    <>
      <div className={styles.finalize}>
        {state.message ? (
          <p className={styles.error} role="alert">
            {state.message}
          </p>
        ) : null}
        <Button type="button" onClick={() => setOpen(true)}>
          순위 확정
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="순위를 확정합니다"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              취소
            </Button>
            <Button
              type="submit"
              form="finalize-form"
              variant="danger"
              disabled={pending || short}
            >
              {pending ? "확정 중…" : "확정"}
            </Button>
          </>
        }
      >
        <p className={styles.modalBody}>
          확정하면 공개 리더보드가 FINAL로 전환되고 수상 내역이 기록됩니다.
          <b> 되돌릴 수 없습니다.</b>
        </p>

        {winners.length > 0 ? (
          <ul className={styles.modalList}>
            {winners.map((winner) => (
              <li key={winner.rank}>
                <span className={styles.modalRank}>
                  {String(winner.rank).padStart(2, "0")}
                </span>
                <span>{winner.teamName}</span>
                <span className={styles.modalAward}>{winner.award}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.modalBody}>
            수상 대상이 없습니다. 순위만 FINAL로 고정됩니다.
          </p>
        )}

        <form action={formAction} id="finalize-form">
          <input type="hidden" name="seasonId" value={seasonId} />
          <label className={styles.reasonLabel} htmlFor="finalize-reason">
            확정 사유
          </label>
          <textarea
            id="finalize-reason"
            name="reason"
            className={styles.reason}
            rows={2}
            minLength={REASON_MIN}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="어느 집계일 기준으로 확정하는지, 제재 반영은 끝났는지 적어 주세요. 감사 로그에 그대로 남습니다."
          />
        </form>
      </Modal>
    </>
  );
}
