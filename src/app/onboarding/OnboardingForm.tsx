"use client";

import { useActionState } from "react";

import { Button } from "@/components/Button";

import { saveOnboarding, type OnboardingState } from "./actions";
import { NAME_MAX, NICKNAME_MAX } from "./schema";

import styles from "./onboarding.module.css";

/*
  오류를 필드 옆에 붙여 보여줘야 해서 클라이언트 컴포넌트다.
  /login이 서버 액션만으로 되는 것과 다른 점 — 거기는 되돌려줄 입력값이 없다.

  ⚠️ input에 required·maxLength만 걸고 끝내지 않는다. 브라우저 기본 검증이
  먼저 가로채면 우리 안내 문구가 뜰 자리가 없어진다(랜딩 동의 체크박스에서
  이미 밟은 함정이다). maxLength는 오타 방지용으로만 두고 판정은 서버가 한다.
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

  const nameError = state.errors?.name?.[0];
  const nicknameError = state.errors?.nickname?.[0];

  return (
    <form action={formAction} className={styles.form} noValidate>
      <input type="hidden" name="next" value={next} />

      {state.message ? (
        <p className={styles.formError} role="alert">
          {state.message}
        </p>
      ) : null}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="name">
          이름
        </label>
        <p className={styles.hint}>
          운영·심사 연락과 상금 지급에 쓰입니다. 공개되지 않습니다.
        </p>
        <input
          id="name"
          name="name"
          className="input"
          type="text"
          maxLength={NAME_MAX}
          autoComplete="name"
          defaultValue={state.values?.name ?? defaultName}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "name-error" : undefined}
        />
        {nameError ? (
          <p className={styles.fieldError} id="name-error">
            {nameError}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="nickname">
          닉네임
        </label>
        <p className={styles.hint}>
          리더보드와 참가작 페이지에 이 이름으로 표시됩니다. 나중에 바꿀 수 있습니다.
        </p>
        <input
          id="nickname"
          name="nickname"
          className="input"
          type="text"
          maxLength={NICKNAME_MAX}
          autoComplete="nickname"
          defaultValue={state.values?.nickname ?? defaultNickname}
          aria-invalid={nicknameError ? true : undefined}
          aria-describedby={nicknameError ? "nickname-error" : undefined}
        />
        {nicknameError ? (
          <p className={styles.fieldError} id="nickname-error">
            {nicknameError}
          </p>
        ) : null}
      </div>

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
