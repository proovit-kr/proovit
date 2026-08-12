"use client";

import { useActionState } from "react";

import { Button } from "@/components/Button";
import { ProfileFields } from "@/components/ProfileFields";

import { saveSettings, type SettingsState } from "./actions";

import styles from "./settings.module.css";

const INITIAL: SettingsState = {};

export function SettingsForm({
  defaultName,
  defaultNickname,
}: {
  defaultName: string;
  defaultNickname: string;
}) {
  const [state, formAction, pending] = useActionState(saveSettings, INITIAL);

  return (
    <form action={formAction} className={styles.form} noValidate>
      {state.message ? (
        <p className={styles.formError} role="alert">
          {state.message}
        </p>
      ) : null}

      <ProfileFields
        errors={state.errors}
        defaultName={state.values?.name ?? defaultName}
        defaultNickname={state.values?.nickname ?? defaultNickname}
      />

      <div className={styles.actions}>
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </Button>
        {/*
          저장은 화면 이동이 없어서 아무 말이 없으면 눌렀는지 알 수 없다.
          aria-live로 화면 낭독기에도 같은 사실이 전달되게 한다.
        */}
        <p className={styles.status} aria-live="polite">
          {state.saved && !pending ? "저장했습니다." : ""}
        </p>
      </div>
    </form>
  );
}
