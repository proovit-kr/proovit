"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import ConsentFields, {
  emptyConsent,
  focusFirstMissingConsent,
  isConsentComplete,
  type ConsentState,
} from "@/components/ConsentFields";
import { APPLY_CONSENTS } from "@/content/consent";

import { joinTeam, type JoinState } from "./join-actions";

import fieldStyles from "@/components/ProfileFields.module.css";
import styles from "./apply.module.css";

/*
  초대 코드로 합류하는 폼.

  ApplyForm과 나눈 이유: 받는 것이 다르다. 팀 이름·참가작·연락처는 팀장이 이미
  냈으므로 다시 묻지 않고, **참가 동의만** 받는다(APPLY_CONSENTS, 09-21부터 둘). 두 폼을 한 파일에 두면
  "지금 어느 갈래인가"를 화면 안에서 또 판정하게 된다.

  코드는 링크에 실려 오지만 입력칸으로 둔다 — 카톡으로 코드만 받은 사람은
  링크가 없다(team.ts 문자표 주석과 같은 상황).
*/

const INITIAL: JoinState = {};
const EMPTY = emptyConsent(APPLY_CONSENTS);

export function JoinForm({ defaultCode }: { defaultCode: string }) {
  const [state, formAction, pending] = useActionState(joinTeam, INITIAL);
  const [consent, setConsent] = useState<ConsentState>(EMPTY);
  const [showMissing, setShowMissing] = useState(false);

  const complete = isConsentComplete(consent, APPLY_CONSENTS);

  return (
    <form
      action={formAction}
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        if (complete) return;
        event.preventDefault();
        setShowMissing(true);
        focusFirstMissingConsent(consent, APPLY_CONSENTS);
      }}
    >
      {state.message ? (
        <p className={styles.formError} role="alert">
          {state.message}
        </p>
      ) : null}

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="code">
          초대 코드
        </label>
        <input
          className="input"
          id="code"
          name="code"
          defaultValue={state.code ?? defaultCode}
          autoComplete="off"
          /* 소문자로 받아도 서버가 대문자로 맞춘다(normalizeInviteCode) */
          spellCheck={false}
          maxLength={16}
        />
      </div>

      <div className={styles.consents}>
        <ConsentFields
          items={APPLY_CONSENTS}
          value={consent}
          onChange={(next) => {
            setConsent(next);
            if (isConsentComplete(next, APPLY_CONSENTS)) setShowMissing(false);
          }}
          disabled={pending}
          showMissing={showMissing}
          missingMessage="필수 항목에 동의해야 팀에 합류할 수 있어요."
        />
        {/*
          ConsentFields는 name 없는 controlled input이라 그대로는 FormData에
          실리지 않는다. 숨은 input으로 얹는다 — ApplyForm과 같은 이유.
        */}
        {APPLY_CONSENTS.map((item) =>
          consent[item.key] ? (
            <input
              key={item.key}
              type="hidden"
              name={`consent-${item.key}`}
              value="on"
            />
          ) : null,
        )}
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        disabled={pending}
      >
        {pending ? "합류 중…" : "팀에 합류하기"}
      </Button>
    </form>
  );
}
