"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { Toast, useToast } from "@/components/Toast";

import {
  claimCreditAction,
  setAppliedAction,
  type CreditActionState,
} from "./actions";

import styles from "./credits.module.css";

/*
  카드 안에서 눌리는 것들. 카드 자체는 서버가 그린다 — 상태 판정이 전부 서버에
  있어서(credits.ts) 클라이언트로 내릴 이유가 없다.

  ⚠️ 코드 복사만 클라이언트에서 하고, 나머지는 서버 액션이다. 「받기」를 낙관적
  갱신으로 처리하지 않는 이유는 코드 풀 소진이다 — 다 떨어진 걸 받은 것처럼
  보여준 뒤에 되돌리면, 그 사이 스크린샷을 찍은 사람에게는 우리가 준 것이 된다.
*/

const INITIAL: CreditActionState = {};

export function ClaimButton({
  offerId,
  label = "크레딧 받기",
}: {
  offerId: string;
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(
    claimCreditAction,
    INITIAL,
  );
  const { message, show } = useToast();

  /*
    ⚠️ 의존성에 `show`만 넣는다. useToast가 돌려주는 객체는 렌더마다 새로 만들어져
    통째로 의존성에 넣으면 effect가 매 렌더 돌고, 그 안에서 다시 상태를 바꿔
    무한 루프가 된다. `show`는 useCallback으로 고정돼 있다.
  */
  useEffect(() => {
    if (state.done) show(state.done);
    else if (state.message) show(state.message);
  }, [state, show]);

  return (
    <form action={formAction} className={styles.inlineForm}>
      <input type="hidden" name="offerId" value={offerId} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "받는 중…" : label}
      </Button>
      {state.message ? (
        <span className={styles.actionError} role="alert">
          {state.message}
        </span>
      ) : null}
      <Toast message={message} />
    </form>
  );
}

/**
 * 「적용했어요」.
 *
 * 체크박스처럼 보이지만 폼 제출이다. 자바스크립트가 죽어 있어도 눌리는 쪽이
 * 낫다 — 이 표시는 스폰서에게 "크레딧이 실제로 쓰였다"고 보고하는 근거라
 * 참가자가 못 켜면 우리가 제휴 실적을 못 만든다.
 */
export function AppliedToggle({
  offerId,
  applied,
}: {
  offerId: string;
  applied: boolean;
}) {
  const [state, formAction, pending] = useActionState(setAppliedAction, INITIAL);
  const { message, show } = useToast();

  useEffect(() => {
    if (state.done) show(state.done);
    else if (state.message) show(state.message);
  }, [state, show]);

  return (
    <form action={formAction} className={styles.appliedForm}>
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="applied" value={applied ? "0" : "1"} />
      <button
        type="submit"
        className={applied ? styles.appliedOn : styles.applied}
        disabled={pending}
        aria-pressed={applied}
      >
        <span className={styles.appliedBox} aria-hidden>
          {applied ? "✓" : ""}
        </span>
        {applied
          ? "적용 확인됨. 잘 쓰고 있는지 스폰서도 같이 봐요"
          : "적용했어요"}
      </button>
      <Toast message={message} />
    </form>
  );
}

/**
 * 코드 복사.
 *
 * 클립보드 API가 막힌 환경(권한 거부·비보안 컨텍스트)에서는 조용히 실패하므로
 * 그때는 "직접 선택해 복사해 주세요"로 말을 바꾼다. 눌렀는데 아무 일도 안 일어난
 * 것처럼 보이는 것이 제일 나쁘다.
 */
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  useEffect(() => {
    if (copied === "idle") return;
    const timer = window.setTimeout(() => setCopied("idle"), 2400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="soft"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied("ok");
        } catch {
          setCopied("fail");
        }
      }}
    >
      {copied === "ok"
        ? "복사했어요"
        : copied === "fail"
          ? "직접 선택해 복사해 주세요"
          : "복사"}
    </Button>
  );
}
