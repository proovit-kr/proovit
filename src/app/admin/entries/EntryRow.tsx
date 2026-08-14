"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { EntryStatus } from "@/generated/prisma/enums";
import { REASON_MIN } from "@/lib/admin";

import { changeEntryStatus, type EntryActionState } from "./actions";

import styles from "./entries.module.css";

/*
  참가 한 줄과 그 줄의 상태 변경.

  ⚠️ 상태를 드롭다운으로 바로 바꾸지 않는다. **사유를 적어야 버튼이 눌리는 구조**로
  둔 이유는, 실격은 되돌리기 어렵고 나중에 반드시 근거를 묻게 되기 때문이다.
  사유 칸을 펼치는 동작 자체가 "지금 무엇을 하려는지" 한 번 더 확인하는 자리다.

  ⚠️ 화면이 막는 것은 안내일 뿐이다. 실제 차단은 액션과 store가 각각 다시 한다.
*/

const INITIAL: EntryActionState = {};

const NEXT_STATUS: Record<string, { value: string; label: string }[]> = {
  [EntryStatus.active]: [
    { value: EntryStatus.disqualified, label: "실격 처리" },
    { value: EntryStatus.eliminated, label: "탈락 처리" },
  ],
  [EntryStatus.eliminated]: [
    { value: EntryStatus.active, label: "복구(진행 중으로)" },
    { value: EntryStatus.disqualified, label: "실격 처리" },
  ],
  [EntryStatus.disqualified]: [
    { value: EntryStatus.active, label: "실격 해제(복구)" },
  ],
  [EntryStatus.withdrawn]: [{ value: EntryStatus.active, label: "복구" }],
};

export function EntryActions({
  entryId,
  status,
}: {
  entryId: string;
  status: string;
}) {
  const [state, formAction, pending] = useActionState(
    changeEntryStatus,
    INITIAL,
  );
  const [open, setOpen] = useState<string | null>(null);

  const options = NEXT_STATUS[status] ?? [];

  return (
    <div className={styles.actions}>
      {state.message ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      {open === null ? (
        <div className={styles.buttons}>
          {options.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant="quiet"
              size="sm"
              onClick={() => setOpen(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : (
        <form action={formAction} className={styles.reasonForm}>
          <input type="hidden" name="entryId" value={entryId} />
          <input type="hidden" name="status" value={open} />
          <label className={styles.reasonLabel} htmlFor={`reason-${entryId}`}>
            {options.find((o) => o.value === open)?.label} 사유
          </label>
          <textarea
            id={`reason-${entryId}`}
            name="reason"
            className={styles.reason}
            rows={2}
            minLength={REASON_MIN}
            placeholder="무엇을 근거로 이 처리를 하는지 적어 주세요. 감사 로그에 그대로 남습니다."
          />
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
