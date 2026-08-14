"use client";

import { useActionState } from "react";

import { Button } from "@/components/Button";
import { AUDIENCE_LABEL } from "@/lib/notify";

import { sendNotification, type NoticeState } from "./actions";

import styles from "./notifications.module.css";

/*
  공지 작성.

  ⚠️ 보내기 전에 **몇 명에게 가는지**를 보여준다. 참가팀이 늘면 이 숫자도 늘고,
  운영자가 "전체"를 누를 때 그 규모를 모르면 실수의 크기를 모른다.

  되돌릴 수 없는 동작이라 한 번 더 묻는 절차를 두지 않았다 — 대신 보낸 뒤에
  몇 명에게 갔는지 즉시 돌려준다. 공지는 잘못 보내도 정정 공지로 덮을 수 있고,
  확인 절차를 겹치면 마감 임박 통지가 늦어진다.
*/

const INITIAL: NoticeState = {};

export function NoticeForm({ counts }: { counts: { all: number; active: number } }) {
  const [state, formAction, pending] = useActionState(
    sendNotification,
    INITIAL,
  );

  return (
    <form action={formAction} className={styles.form}>
      {state.message ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}
      {state.sent ? (
        <p className={styles.sent} role="status">
          {state.sent}명에게 보냈습니다.
        </p>
      ) : null}

      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>받는 사람</legend>
        <div className={styles.audiences}>
          <label className={styles.audience}>
            <input type="radio" name="audience" value="all" defaultChecked />
            <span>
              {AUDIENCE_LABEL.all}
              <span className={styles.count}>{counts.all}명</span>
            </span>
          </label>
          <label className={styles.audience}>
            <input type="radio" name="audience" value="active" />
            <span>
              {AUDIENCE_LABEL.active}
              <span className={styles.count}>{counts.active}명</span>
            </span>
          </label>
        </div>
      </fieldset>

      <label className={styles.label} htmlFor="title">
        제목
      </label>
      <input
        id="title"
        name="title"
        className={styles.input}
        placeholder="s2 제출 마감이 내일입니다"
      />

      <label className={styles.label} htmlFor="body">
        본문
      </label>
      <textarea
        id="body"
        name="body"
        className={styles.textarea}
        rows={5}
        placeholder="마감 시각과 무엇을 내야 하는지 적어 주세요."
      />

      <label className={styles.label} htmlFor="linkUrl">
        링크 <span className={styles.optional}>선택 · 서비스 안 주소만</span>
      </label>
      <input
        id="linkUrl"
        name="linkUrl"
        className={styles.input}
        placeholder="/dashboard/submit/s2"
      />

      <Button type="submit" variant="soft" size="sm" disabled={pending}>
        {pending ? "보내는 중…" : "보내기"}
      </Button>
    </form>
  );
}
