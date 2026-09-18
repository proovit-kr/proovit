"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/Button";
import ConsentFields, {
  emptyConsent,
  isConsentComplete,
  type ConsentState,
} from "@/components/ConsentFields";
import { SIGNUP_CONSENTS } from "@/content/consent";

import styles from "./ConsentDialog.module.css";

/*
  계정 동의 모달 — 시안 ver4 `#scr-auth`의 ② 「콜백 뒤 동의 모달」.

  직전 페이지 위에 덮인다. 시안의 `.consent-ov`는 뷰어 셸 안이라 `position:absolute`지만
  제품에서는 뷰포트를 덮어야 하므로 `fixed`다(모듈 CSS의 같은 줄 주석).

  ⚠️ **닫는 길이 두 버튼뿐이다.** 배경 클릭·ESC로 닫히지 않는다(시안 개발 메모).
  그래서 `Modal.tsx`를 재사용하지 않았다 — 그쪽은 되돌릴 수 있는 확인 모달이라
  ESC와 바깥 클릭으로 닫는 것이 요건이고, 여기는 정반대다. 옵션으로 가르면
  "어떤 모달은 안 닫힌다"가 한 컴포넌트 안에 숨는다.
*/

/** 시안 `.acct .pv` — 제공자 머리글자. 카카오만 노란 바탕이다 */
const PROVIDER = {
  kakao: { mark: "K", label: "카카오 계정으로 로그인했어요" },
  google: { mark: "G", label: "Google 계정으로 로그인했어요" },
} as const;

function SubmitButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();

  /*
    ⚠️ 여기서는 시안대로 **버튼을 잠근다**(`<button id="consentGo" disabled>`).
    랜딩·참가 신청 폼은 반대로 잠그지 않는데(눌리게 두고 빈 항목으로 포커스를
    옮긴다), 그건 폼이 길어 무엇이 비었는지 찾아야 하기 때문이다. 이 모달은
    체크박스 넷이 버튼 바로 위에 모여 있어 찾을 것이 없다.
  */
  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      block
      disabled={!ready || pending}
    >
      {pending ? "저장 중…" : "동의하고 시작하기"}
    </Button>
  );
}

function DeclineButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" block disabled={pending}>
      동의하지 않고 로그아웃
    </Button>
  );
}

export function ConsentDialog({
  provider,
  maskedEmail,
  reconsent,
  onAccept,
  onDecline,
}: {
  provider: "kakao" | "google" | null;
  maskedEmail: string;
  /** 문안 개정으로 다시 받는 경우. 「한 번만 받아요」를 쓰면 안 된다 */
  reconsent: boolean;
  onAccept: (formData: FormData) => Promise<void>;
  onDecline: () => Promise<void>;
}) {
  const [consent, setConsent] = useState<ConsentState>(() =>
    emptyConsent(SIGNUP_CONSENTS),
  );
  const ready = isConsentComplete(consent, SIGNUP_CONSENTS);
  const account = provider ? PROVIDER[provider] : null;

  return (
    <div className={styles.overlay}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-consent-title"
      >
        <h2 id="account-consent-title" className={styles.title}>
          시작하기 전에 확인해 주세요
        </h2>
        <p className={styles.sub}>
          {reconsent
            ? /*
                ⚠️ 개정 재동의에는 시안 문장을 그대로 쓰지 않는다. 「한 번만
                받아요」는 처음 가입하는 사람에게 참인 말이고, 두 번째로 보는
                사람에게는 거짓이 된다.
              */
              "약관이 개정되어 다시 확인이 필요해요. 바뀐 내용을 보고 동의해 주세요."
            : "PROOVIT 계정을 만들려면 아래 항목에 동의가 필요해요. 한 번만 받아요."}
        </p>

        {account ? (
          <div className={styles.acct}>
            <span
              className={`${styles.pv} ${provider === "kakao" ? styles.pvKakao : ""}`}
              aria-hidden
            >
              {account.mark}
            </span>
            <span>{account.label}</span>
            {maskedEmail ? (
              <span className={styles.num}>{maskedEmail}</span>
            ) : null}
          </div>
        ) : null}

        <form action={onAccept}>
          <ConsentFields
            items={SIGNUP_CONSENTS}
            value={consent}
            onChange={setConsent}
            /* 시안 ver4가 이 모달에 「모두 동의」 줄을 둔다(1735행 `label.all`) */
            selectAll
            /* ⚠️ 랜딩 폼은 「모두 선택」이다. 모달만 「동의」로 적혀 있다 */
            selectAllLabel="모두 동의"
            className={styles.consents}
          />
          {/*
            ConsentFields는 name 없는 controlled input이라 FormData에 실리지
            않는다. 숨은 input으로 얹는다 — ApplyForm과 같은 방식이고, 판정은
            어차피 서버 액션이 다시 한다.
          */}
          {SIGNUP_CONSENTS.map((item) =>
            consent[item.key] ? (
              <input
                key={item.key}
                type="hidden"
                name={`consent-${item.key}`}
                value="on"
              />
            ) : null,
          )}

          <div className={styles.ft}>
            <SubmitButton ready={ready} />
          </div>
        </form>

        {/*
          ⚠️ 거부는 **별도 폼**이다. 같은 폼 안에 두면 체크 상태가 함께 실려
          "동의하지 않음"에 동의 값이 붙는다. 서버 액션도 따로다.
        */}
        <form action={onDecline} className={styles.declineForm}>
          <DeclineButton />
        </form>

        <p className={styles.why}>
          동의하지 않으면 로그아웃돼요. 다음에 로그인하면 다시 물어볼게요. 동의
          내용은 계정 설정에서 언제든 확인하고 철회할 수 있어요.
        </p>
      </div>
    </div>
  );
}
