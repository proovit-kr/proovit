"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import {
  APPEAL_REASON_MAX,
  APPEAL_REASON_MIN,
  RESPONSE_BUSINESS_DAYS,
} from "@/lib/appeal";

import { fileAppeal, type AppealState } from "./actions";

import fieldStyles from "@/components/ProfileFields.module.css";
import styles from "./appeal.module.css";

/*
  이의신청 폼.

  ⚠️ 이미 신청한 대상은 고를 수 없게 잠근다. 두 번 내면 답변 기한이 두 개가 되고
  운영이 어느 쪽에 답해야 하는지 갈린다.

  글자 수를 세어 보여주는 이유: 최소 길이가 있는데 왜 안 눌리는지 모르면
  사람은 버튼을 다시 누른다.
*/

const INITIAL: AppealState = {};

export type TargetOption = {
  value: string;
  label: string;
  when: string;
  appealed: boolean;
};

export function AppealForm({
  targets,
  canWrite,
}: {
  targets: TargetOption[];
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(fileAppeal, INITIAL);
  const [reason, setReason] = useState(state.values?.reason ?? "");

  const open = targets.filter((target) => !target.appealed);
  const short = reason.trim().length < APPEAL_REASON_MIN;

  if (targets.length === 0) {
    return (
      <p className={styles.none}>
        아직 이의신청할 대상이 없습니다. 심사 결과나 어뷰징 검토 통지를 받으면
        여기서 신청할 수 있습니다.
      </p>
    );
  }

  return (
    <form action={formAction} className={styles.form} noValidate>
      {state.message ? (
        <p className={styles.formError} role="alert">
          {state.message}
        </p>
      ) : null}
      {state.done ? (
        <p className={styles.saved} role="status">
          접수했습니다. {RESPONSE_BUSINESS_DAYS}영업일 안에 답변드립니다.
        </p>
      ) : null}

      <fieldset className={styles.fieldset}>
        <legend className={fieldStyles.label}>무엇에 대한 이의신청인가요</legend>
        <div className={styles.targets}>
          {targets.map((target) => (
            <label
              key={target.value}
              className={target.appealed ? styles.targetDone : styles.target}
            >
              <input
                type="radio"
                name="target"
                value={target.value}
                disabled={!canWrite || target.appealed}
                defaultChecked={state.values?.target === target.value}
              />
              <span className={styles.targetBody}>
                <span className={styles.targetLabel}>{target.label}</span>
                <span className={styles.targetWhen}>
                  {target.when}
                  {target.appealed ? " · 이미 신청함" : null}
                </span>
              </span>
            </label>
          ))}
        </div>
        {open.length === 0 ? (
          <p className={styles.note}>
            신청할 수 있는 대상이 없습니다. 접수된 건의 답변을 기다려 주세요.
          </p>
        ) : null}
      </fieldset>

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="reason">
          어디가 어떻게 잘못됐다고 보시나요
        </label>
        <p className={fieldStyles.hint}>
          <span>
            어느 지표·어느 판단이 문제인지 구체적으로 적어 주세요. 산정 오류가
            확인되면 결과를 정정합니다(규칙 제11조 ③).
          </span>
        </p>
        <textarea
          className="textarea"
          id="reason"
          name="reason"
          rows={8}
          maxLength={APPEAL_REASON_MAX}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={!canWrite || open.length === 0}
        />
        <p className={styles.count}>
          {reason.trim().length} / 최소 {APPEAL_REASON_MIN}자
        </p>
      </div>

      {canWrite ? (
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={pending || short || open.length === 0}
        >
          {pending ? "접수 중…" : "이의신청 접수"}
        </Button>
      ) : null}
    </form>
  );
}
