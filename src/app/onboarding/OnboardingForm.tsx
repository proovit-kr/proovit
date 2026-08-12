"use client";

import { useActionState } from "react";

import { Button } from "@/components/Button";
import { ProfileFields } from "@/components/ProfileFields";

import { saveOnboarding, type OnboardingState } from "./actions";

import styles from "./onboarding.module.css";

/*
  오류를 필드 옆에 붙여 보여줘야 해서 클라이언트 컴포넌트다.
  /login이 서버 액션만으로 되는 것과 다른 점 — 거기는 되돌려줄 입력값이 없다.
*/

const INITIAL: OnboardingState = {};

export function OnboardingForm({
  next,
  defaultName,
  defaultNickname,
}: {
  next: string;
  defaultName: string;
  defaultNickname: string;
}) {
  const [state, formAction, pending] = useActionState(saveOnboarding, INITIAL);

  return (
    <form action={formAction} className={styles.form} noValidate>
      <input type="hidden" name="next" value={next} />

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

      {/*
        전송 중에만 진짜 disabled를 건다. 그 외에는 눌리게 두고 서버가 이유를
        말한다 — 못 누르는 버튼은 "왜 안 되는지"를 설명할 자리가 없다(CLAUDE.md 학습분).
      */}
      <Button type="submit" variant="primary" size="lg" block disabled={pending}>
        {pending ? "저장 중…" : "시작하기"}
      </Button>
    </form>
  );
}
