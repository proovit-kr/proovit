"use client";

import { NAME_MAX, NICKNAME_MAX, type ProfileFieldErrors } from "@/lib/profile";

import styles from "./ProfileFields.module.css";

/*
  이름·닉네임 입력 두 칸. /onboarding과 /settings가 같은 값을 받으므로
  마크업도 한 곳에 둔다 — 안내 문구가 두 화면에서 달라지면 같은 값인지
  사용자가 알 수 없다.

  ⚠️ input에 required를 걸지 않는다. 브라우저 기본 검증이 먼저 가로채면
  우리 안내 문구가 뜰 자리가 없어진다(랜딩 동의 체크박스에서 이미 밟은 함정).
  maxLength는 오타 방지용으로만 두고 판정은 서버가 한다.
*/

export function ProfileFields({
  errors,
  defaultName,
  defaultNickname,
  nameLocked = false,
}: {
  errors?: ProfileFieldErrors;
  defaultName: string;
  defaultNickname: string;
  /**
   * 참가 신청이 확정돼 실명이 잠겼다. 판정은 서버(profile-store)가 하고
   * 여기서는 그 사실을 보여주기만 한다.
   */
  nameLocked?: boolean;
}) {
  const nameError = errors?.name?.[0];
  const nicknameError = errors?.nickname?.[0];

  return (
    <>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="name">
          이름
        </label>
        {/*
          문장마다 제 줄을 갖게 한다. <br>을 쓰지 않는 이유는, 문장이 길어져
          한 줄에 안 들어갈 때 <br>은 그 자리에서만 끊고 나머지는 아무 데서나
          접히기 때문이다. 블록으로 두면 각 문장이 자기 줄 안에서만 접힌다.
        */}
        <p className={styles.hint}>
          <span>운영·심사 연락과 상금 지급에 쓰입니다.</span>
          {nameLocked ? (
            /*
              왜 잠겼는지를 같이 말한다. 이유 없이 회색으로 굳어 있으면
              고장으로 읽히고, 그 문의가 그대로 운영 손으로 온다.
            */
            <span>
              참가 신청이 접수돼 바꿀 수 없습니다. 고쳐야 하면 운영에 문의해
              주세요.
            </span>
          ) : (
            <span>공개되지 않습니다.</span>
          )}
        </p>
        <input
          id="name"
          name="name"
          className="input"
          type="text"
          maxLength={NAME_MAX}
          autoComplete="name"
          defaultValue={defaultName}
          /*
            disabled가 아니라 readOnly다. disabled는 값이 폼에서 통째로 빠져
            서버가 "빈 값으로 고치려는 요청"과 구분하지 못한다.
          */
          readOnly={nameLocked}
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
          <span>리더보드와 참가작 페이지에 이 이름으로 표시됩니다.</span>
          <span>설정에서 언제든 바꿀 수 있습니다.</span>
        </p>
        <input
          id="nickname"
          name="nickname"
          className="input"
          type="text"
          maxLength={NICKNAME_MAX}
          autoComplete="nickname"
          defaultValue={defaultNickname}
          aria-invalid={nicknameError ? true : undefined}
          aria-describedby={nicknameError ? "nickname-error" : undefined}
        />
        {nicknameError ? (
          <p className={styles.fieldError} id="nickname-error">
            {nicknameError}
          </p>
        ) : null}
      </div>
    </>
  );
}
