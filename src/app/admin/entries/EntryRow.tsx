"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { Select } from "@/components/Field";
import { EntryStatus } from "@/generated/prisma/enums";

import c from "../console.module.css";
import { ReasonModal } from "../ReasonModal";
import { changeEntryStatus, type EntryActionState } from "./actions";

/*
  한 줄의 「상태 전환」 — 시안은 버튼이 곧바로 사유 모달(`#mdl-reason`)을 연다.

  시안 모달에는 어느 상태로 바꿀지 고르는 칸이 없다. 사유만으로는 무엇을 했는지가
  안 남아서 모달에 선택 칸을 하나 얹었다(내가 정함, 수연 확인 대기). 고를 수 있는
  것은 지금 상태에서 갈 수 있는 곳뿐이다.

  ⚠️ 화면이 막는 것은 안내일 뿐이다. 실제 차단은 액션과 store가 각각 다시 한다.
*/

const INITIAL: EntryActionState = {};

const NEXT_STATUS: Record<string, { value: string; label: string }[]> = {
  [EntryStatus.active]: [
    { value: EntryStatus.eliminated, label: "eliminated, 탈락 처리" },
    { value: EntryStatus.disqualified, label: "disqualified, 실격 처리" },
  ],
  [EntryStatus.eliminated]: [
    { value: EntryStatus.active, label: "active, 복구" },
    { value: EntryStatus.disqualified, label: "disqualified, 실격 처리" },
  ],
  [EntryStatus.disqualified]: [{ value: EntryStatus.active, label: "active, 실격 해제" }],
  [EntryStatus.withdrawn]: [{ value: EntryStatus.active, label: "active, 복구" }],
};

export function EntryActions({
  entryId,
  teamName,
  status,
}: {
  entryId: string;
  teamName: string;
  status: string;
}) {
  const [state, action, pending] = useActionState(changeEntryStatus, INITIAL);
  const [open, setOpen] = useState(false);
  const options = NEXT_STATUS[status] ?? [];
  const [next, setNext] = useState(options[0]?.value ?? "");

  /* 저장되면 닫는다 — 렌더 중에 앞 값과 견준다 */
  const [seen, setSeen] = useState(state.done);
  if (seen !== state.done) {
    setSeen(state.done);
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className={c.tblBtn}
        disabled={options.length === 0}
        onClick={() => setOpen(true)}
      >
        상태 전환
      </Button>
      <ReasonModal
        open={open}
        onClose={() => setOpen(false)}
        action={action}
        pending={pending}
        message={state.message}
        fields={{ entryId, status: next }}
        extra={
          <Select
            aria-label={`${teamName} 바꿀 상태`}
            style={{ marginTop: "12px" }}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        }
      />
    </>
  );
}
