"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { MERCHANT_ID_MAX, PROVIDERS } from "@/lib/payment";

import { savePayment, type PaymentState } from "./actions";

import fieldStyles from "@/components/ProfileFields.module.css";
import styles from "./payment.module.css";

/*
  결제 연동 폼.

  ⚠️ **키 입력 칸이 없다.** 암호화 저장이 붙기 전에는 받지 않는다(payment.ts).
  칸을 만들어두고 "나중에 암호화"로 두면 그 사이에 새는 것은 참가팀의 PG
  자격증명이다 — 우리 것이 아니라 남의 것이라 더 위험하다.
*/

const INITIAL: PaymentState = {};

export function PaymentForm({
  defaults,
  locked,
  canWrite,
}: {
  defaults: { provider: string; merchantId: string };
  locked: boolean;
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(savePayment, INITIAL);
  const [provider, setProvider] = useState(defaults.provider || "toss");

  const disabled = !canWrite || locked;
  const hint = PROVIDERS.find((item) => item.value === provider)?.hint;

  return (
    <form action={formAction} className={styles.form} noValidate>
      {state.message ? (
        <p className={styles.formError} role="alert">
          {state.message}
        </p>
      ) : null}
      {state.done ? (
        <p className={styles.saved} role="status">
          등록했습니다. 실제 결제가 들어오면 연동이 확인됩니다.
        </p>
      ) : null}

      <fieldset className={styles.fieldset}>
        <legend className={fieldStyles.label}>결제사</legend>
        <div className={styles.choices}>
          {PROVIDERS.map((item) => (
            <label key={item.value} className={styles.choice}>
              <input
                type="radio"
                name="provider"
                value={item.value}
                checked={provider === item.value}
                onChange={() => setProvider(item.value)}
                disabled={disabled}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="merchantId">
          상점 아이디
        </label>
        <p className={fieldStyles.hint}>
          <span>{hint}</span>
          <span>
            비밀값이 아닙니다. 결제창을 여는 스크립트에 그대로 실리는 공개
            식별자이고, 매출이 어느 상점 건인지 가리는 데 씁니다.
          </span>
        </p>
        <input
          className="input"
          id="merchantId"
          name="merchantId"
          maxLength={MERCHANT_ID_MAX}
          defaultValue={state.values?.merchantId ?? defaults.merchantId}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
        />
        {state.error ? (
          <p className={fieldStyles.fieldError}>{state.error}</p>
        ) : null}
      </div>

      {canWrite && !locked ? (
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? "등록 중…" : "등록하기"}
        </Button>
      ) : null}
    </form>
  );
}
