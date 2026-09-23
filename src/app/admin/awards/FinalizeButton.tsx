"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";

import { finalizeRanking, type FinalizeState } from "./actions";

/*
  순위 확정 — 시안 「순위 확정」 → `#mdl-final`(3327행).

  ⚠️ 확인 모달을 반드시 거친다. 버튼 하나로 공개 리더보드가 FINAL로 바뀌므로
  무엇이 바뀌는지를 모달 본문에 적는다(시안 문구 그대로). 시안 모달에는 사유 칸이
  없어 감사 로그 사유는 「최종 순위 확정」으로 남는다(actions.ts).
*/

const INITIAL: FinalizeState = {};

export function FinalizeButton({ seasonId }: { seasonId: string }) {
  const [state, action, pending] = useActionState(finalizeRanking, INITIAL);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="primary" style={{ marginLeft: "auto" }} onClick={() => setOpen(true)}>
        순위 확정
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="최종 순위를 확정할까요?"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
            <form action={action}>
              <input type="hidden" name="seasonId" value={seasonId} />
              <Button type="submit" variant="primary" disabled={pending}>
                순위 확정
              </Button>
            </form>
          </>
        }
      >
        <p>
          확정 즉시 공개 리더보드가 <b style={{ color: "var(--accent)" }}>FINAL</b>로 전환되고 시상
          내역이 발표돼요. <b style={{ color: "var(--danger)" }}>되돌릴 수 없어요.</b>
        </p>
        {state.message ? (
          <p role="alert" style={{ marginTop: "10px", fontSize: "13px", color: "var(--danger)" }}>
            {state.message}
          </p>
        ) : null}
      </Modal>
    </>
  );
}
