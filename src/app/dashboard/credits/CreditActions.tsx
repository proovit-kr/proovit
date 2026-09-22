"use client";

import { type ReactNode, useActionState } from "react";

import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { CREDITS_TOAST, CREDIT_CARD_TEXT as T } from "@/content/credits";

import { claimCreditAction, setAppliedAction, type CreditActionState } from "./actions";
import { useCreditsToast } from "./CreditsToast";

/*
  카드 안에서 눌리는 것들. 카드 자체는 서버가 그린다 — 상태 판정이 전부 서버에
  있어서(credits.ts) 클라이언트로 내릴 이유가 없다. 모양(클래스·인라인 크기)은
  시안 `crCard`의 것이고 page.tsx가 넘겨 준다.

  ⚠️ 코드 복사만 클라이언트에서 하고, 나머지는 서버 액션이다. 「받기」를 낙관적
  갱신으로 처리하지 않는 이유는 코드 풀 소진이다 — 다 떨어진 걸 받은 것처럼
  보여준 뒤에 되돌리면, 그 사이 스크린샷을 찍은 사람에게는 우리가 준 것이 된다.

  토스트는 판에 하나다(CreditsToast.tsx) — 여기서는 띄우기만 한다.

  ⚠️ 액션 결과를 effect가 아니라 **액션 안에서** 토스트로 띄운다. 「받기」가
  성공하면 서버가 화면을 다시 그려 이 폼이 코드 상자로 바뀌는데(언마운트), 그
  뒤에 돌 effect는 없다 — 토스트가 안 뜬다. 액션이 돌려주기 전에 띄우면 화면
  갱신과 같은 전환에 실린다.
*/

const INITIAL: CreditActionState = {};

/** 시안 `.cr .cr-act .btn`의 크기 */
const ACT_BTN = { padding: "10px 18px", fontSize: "13.5px" } as const;
/** 시안 `.cr .code .cp .btn`의 크기 */
const CP_BTN = { padding: "7px 13px", fontSize: "12.5px" } as const;

/**
 * 「크레딧 받기」 — 시안 ④ C2의 `.cr-act`. 폼 자체가 행동 줄이라 링크·안내가
 * 같은 줄에 선다(자식으로 받는다).
 */
export function ClaimForm({
  offerId,
  className,
  children,
}: {
  offerId: string | null;
  className: string;
  children: ReactNode;
}) {
  const show = useCreditsToast();
  const [, formAction, pending] = useActionState(
    async (prev: CreditActionState, formData: FormData) => {
      const next = await claimCreditAction(prev, formData);
      show(next.done ?? next.message ?? "");
      return next;
    },
    INITIAL,
  );

  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="offerId" value={offerId ?? ""} />
      <Button type="submit" style={ACT_BTN} disabled={pending || !offerId}>
        {T.ready.claim}
      </Button>
      {children}
    </form>
  );
}

/**
 * 「적용했어요」 — 시안 `.okrow` + `.chk`(role="checkbox").
 *
 * 체크박스처럼 보이지만 폼 제출이다. 자바스크립트가 죽어 있어도 눌리는 쪽이
 * 낫다 — 이 표시는 스폰서에게 "크레딧이 실제로 쓰였다"고 보고하는 근거라
 * 참가자가 못 켜면 우리가 제휴 실적을 못 만든다.
 */
export function AppliedCheck({
  offerId,
  applied,
  className,
  boxClassName,
  children,
}: {
  offerId: string;
  applied: boolean;
  className: string;
  boxClassName: string;
  children: ReactNode;
}) {
  const show = useCreditsToast();
  const [, formAction, pending] = useActionState(
    async (prev: CreditActionState, formData: FormData) => {
      const next = await setAppliedAction(prev, formData);
      show(next.done ?? next.message ?? "");
      return next;
    },
    INITIAL,
  );

  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="applied" value={applied ? "0" : "1"} />
      <button
        type="submit"
        className={boxClassName}
        role="checkbox"
        aria-checked={applied}
        disabled={pending}
      >
        <Icon name="check" />
      </button>
      {children}
    </form>
  );
}

/**
 * 코드 복사 — 시안 `.cp .btn-outline`.
 *
 * 클립보드 API가 막힌 환경(권한 거부·비보안 컨텍스트)에서는 조용히 실패하므로
 * 그때는 토스트로 「직접 선택해 복사해 주세요」라고 말한다. 눌렀는데 아무 일도
 * 안 일어난 것처럼 보이는 것이 제일 나쁘다.
 */
export function CopyButton({ value }: { value: string }) {
  const show = useCreditsToast();
  return (
    <Button
      type="button"
      variant="outline"
      style={CP_BTN}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          show(CREDITS_TOAST.copied);
        } catch {
          show(CREDITS_TOAST.copyFailed);
        }
      }}
    >
      {T.sent.copy}
    </Button>
  );
}
