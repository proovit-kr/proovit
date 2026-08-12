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
import {
  IDEA_SUMMARY_MAX,
  IDEA_TITLE_MAX,
  TEAM_NAME_MAX,
  formatPhone,
} from "@/lib/apply";

import { submitApply, type ApplyState } from "./actions";

import fieldStyles from "@/components/ProfileFields.module.css";
import styles from "./apply.module.css";

/*
  오류를 필드 옆에 붙여야 하고 동의 상태를 들고 있어야 해서 클라이언트 컴포넌트다.

  ⚠️ 동의 체크박스는 ConsentFields가 React 상태로 들고 있어서 그대로 두면 FormData에
  실리지 않는다(그 컴포넌트는 name 없는 controlled input이다). 숨은 input으로
  같은 값을 폼에 얹어 서버 액션이 읽게 한다 — 판정은 어차피 서버가 다시 한다.
*/

const INITIAL: ApplyState = {};
const EMPTY = emptyConsent(APPLY_CONSENTS);

export function ApplyForm({
  defaultTeamName,
  defaultPhone,
}: {
  defaultTeamName: string;
  defaultPhone: string;
}) {
  const [state, formAction, pending] = useActionState(submitApply, INITIAL);
  const [consent, setConsent] = useState<ConsentState>(EMPTY);
  const [showMissing, setShowMissing] = useState(false);
  const [isSolo, setIsSolo] = useState(state.values?.isSolo ?? true);

  const complete = isConsentComplete(consent, APPLY_CONSENTS);

  return (
    <form
      action={formAction}
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        if (complete) return;
        /*
          막고 나서 왜 막혔는지를 같이 알린다. 문구만 띄우면 항목이 셋일 때
          어느 것인지 찾아야 한다(ConsentFields.focusFirstMissingConsent 주석).
        */
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

      <fieldset className={styles.fieldset}>
        <legend className={fieldStyles.label}>참가 형태</legend>
        <p className={fieldStyles.hint}>
          <span>혼자 나가도 1인 팀으로 등록됩니다.</span>
          <span>팀원 초대는 신청 후 대시보드에서 할 수 있습니다.</span>
        </p>
        <div className={styles.choices}>
          {[
            { value: "solo", label: "혼자 참가" },
            { value: "team", label: "팀으로 참가" },
          ].map((option) => (
            <label key={option.value} className={styles.choice}>
              <input
                type="radio"
                name="isSolo"
                value={option.value}
                checked={isSolo === (option.value === "solo")}
                onChange={() => setIsSolo(option.value === "solo")}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="teamName">
          팀 이름
        </label>
        <p className={fieldStyles.hint}>
          <span>리더보드와 참가작 페이지에 이 이름으로 표시됩니다.</span>
        </p>
        <input
          id="teamName"
          name="teamName"
          className="input"
          type="text"
          maxLength={TEAM_NAME_MAX}
          defaultValue={state.values?.teamName ?? defaultTeamName}
          aria-invalid={state.errors?.teamName ? true : undefined}
          aria-describedby={state.errors?.teamName ? "teamName-error" : undefined}
        />
        {state.errors?.teamName?.[0] ? (
          <p className={fieldStyles.fieldError} id="teamName-error">
            {state.errors.teamName[0]}
          </p>
        ) : null}
      </div>

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="ideaTitle">
          참가작 이름
        </label>
        <p className={fieldStyles.hint}>
          <span>만들려는 서비스의 이름입니다.</span>
          <span>정하지 못했다면 가제로 적고 나중에 바꿔도 됩니다.</span>
        </p>
        <input
          id="ideaTitle"
          name="ideaTitle"
          className="input"
          type="text"
          maxLength={IDEA_TITLE_MAX}
          defaultValue={state.values?.ideaTitle ?? ""}
          aria-invalid={state.errors?.ideaTitle ? true : undefined}
          aria-describedby={
            state.errors?.ideaTitle ? "ideaTitle-error" : undefined
          }
        />
        {state.errors?.ideaTitle?.[0] ? (
          <p className={fieldStyles.fieldError} id="ideaTitle-error">
            {state.errors.ideaTitle[0]}
          </p>
        ) : null}
      </div>

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="ideaSummary">
          한 줄 소개 <span className={styles.optional}>(선택)</span>
        </label>
        <p className={fieldStyles.hint}>
          <span>누구의 어떤 문제를 푸는지 한 문장으로 적어주세요.</span>
        </p>
        <textarea
          id="ideaSummary"
          name="ideaSummary"
          className={`input ${styles.textarea}`}
          rows={3}
          maxLength={IDEA_SUMMARY_MAX}
          defaultValue={state.values?.ideaSummary ?? ""}
          aria-invalid={state.errors?.ideaSummary ? true : undefined}
          aria-describedby={
            state.errors?.ideaSummary ? "ideaSummary-error" : undefined
          }
        />
        {state.errors?.ideaSummary?.[0] ? (
          <p className={fieldStyles.fieldError} id="ideaSummary-error">
            {state.errors.ideaSummary[0]}
          </p>
        ) : null}
      </div>

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="phone">
          연락처
        </label>
        <p className={fieldStyles.hint}>
          <span>마감·심사 결과 통지에 쓰입니다. 공개되지 않습니다.</span>
          <span>번호가 틀리면 통지가 다른 사람에게 갑니다.</span>
        </p>
        <input
          id="phone"
          name="phone"
          className="input"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="010-1234-5678"
          defaultValue={
            state.values?.phone ??
            (defaultPhone ? formatPhone(defaultPhone) : "")
          }
          aria-invalid={state.errors?.phone ? true : undefined}
          aria-describedby={state.errors?.phone ? "phone-error" : undefined}
        />
        {state.errors?.phone?.[0] ? (
          <p className={fieldStyles.fieldError} id="phone-error">
            {state.errors.phone[0]}
          </p>
        ) : null}
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
          missingMessage="필수 항목에 동의해야 참가 신청을 접수할 수 있어요."
        />
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

      {/*
        전송 중에만 진짜 disabled를 건다. 동의가 비었다고 버튼을 잠그면
        "왜 안 되는지"를 설명할 자리가 사라진다(OnboardingForm과 같은 규칙).
      */}
      <Button type="submit" variant="primary" size="lg" block disabled={pending}>
        {pending ? "접수 중…" : "참가 신청하기"}
      </Button>
    </form>
  );
}
