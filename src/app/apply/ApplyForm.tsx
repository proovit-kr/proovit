"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { Clauses } from "@/components/Clauses";
import ConsentFields, {
  emptyConsent,
  focusFirstMissingConsent,
  isConsentComplete,
  type ConsentState,
} from "@/components/ConsentFields";
import { Field, Input, Textarea } from "@/components/Field";
import { APPLY_CONSENTS } from "@/content/consent";
import {
  IDEA_SUMMARY_MAX,
  IDEA_TITLE_MAX,
  INVITE_EMAIL_MAX,
  TEAM_NAME_MAX,
} from "@/lib/apply";

import { submitApply, type ApplyState } from "./actions";

import styles from "./ApplyForm.module.css";

/*
  참가 신청 ① 작성 — 시안 ver4 `#scr-apply[data-state="form"]`의
  `.only-form`(시안 2096~2120행).

  ⚠️ `h1`·`.ss`는 ② 신청 완료와 공용인 기둥(`.ap-wrap`)에 딸린 것이라
  page.tsx가 그린다. 이 컴포넌트는 「트랙 선택」부터 버튼까지 `<form>`
  안쪽만 그린다.

  오류를 칸 옆에 붙여야 하고 동의 상태를 들고 있어야 해서 클라이언트
  컴포넌트다.

  ⚠️ 동의 체크박스는 ConsentFields가 React 상태로 들고 있어서 그대로 두면
  FormData에 실리지 않는다(그 컴포넌트는 name 없는 controlled input이다).
  숨은 input으로 같은 값을 폼에 얹어 서버 액션이 읽게 한다 — 판정은 어차피
  서버가 다시 한다.

  ⚠️ **연락처(phone) 칸이 없다**(2026-09-21 수연 결정). 동의 문안 C의 수집
  항목이 「연락처(휴대전화 **또는** 이메일)」이고 통지 정본이 email·inapp이라
  휴대전화를 여기서 다시 받을 이유가 없다. 알림톡은 사업자 등록 전까지 못
  쓴다(카카오 개인 개발자 비즈 앱). `users.phone` 컬럼과 설정 화면은 그대로
  두고 이 화면에서만 뺐다.
*/

const INITIAL: ApplyState = {};
const EMPTY = emptyConsent(APPLY_CONSENTS);

export function ApplyForm({
  defaultTeamName,
  lateCode,
}: {
  defaultTeamName: string;
  /**
   * 지각 편입 링크의 코드(`/apply?late=`). 레이스 중 링크로 온 사람에게만 page.tsx가
   * 넘긴다. 폼은 평소 신청서(시안 ①) 그대로이고 이 값만 숨은 칸으로 싣는다.
   */
  lateCode?: string;
}) {
  const [state, formAction, pending] = useActionState(submitApply, INITIAL);
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
        /*
          막고 나서 왜 막혔는지를 같이 알린다. 문구만 띄우면 항목이 둘일 때도
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

      {lateCode ? <input type="hidden" name="late" value={lateCode} /> : null}

      <Field label="트랙 선택">
        {/*
          시안은 라벨 하나에 라디오 둘을 놓고 묶음 표시를 따로 안 한다. 라벨이
          어느 입력에 걸린 것인지 알 수 없으므로 묶음 자체에 이름을 준다 —
          fieldset/legend로 바꾸면 `.fld`의 상자 모양이 달라진다.
        */}
        <div className={styles.trk} role="radiogroup" aria-label="트랙 선택">
          <label>
            <input
              type="radio"
              name="track"
              value="free"
              defaultChecked={(state.values?.track ?? "free") === "free"}
            />
            <b>자유 주제</b>
            <small>
              <Clauses text="무엇이든 좋아요. 골든패스 가이드가 함께해요." />
            </small>
          </label>
          {/*
            시즌1은 단일 트랙이라 늘 잠겨 있다. 지우지 않고 남기는 것이 시안의
            뜻이다 — 「없는 것」이 아니라 「아직 안 열린 것」을 보여 준다.
          */}
          <label className={styles.dis}>
            <input type="radio" name="track" value="theme" disabled />
            <b>테마 트랙</b>
            <small>
              <Clauses text="스폰서 협의 중, 시즌 2부터" />
            </small>
          </label>
        </div>
      </Field>

      {/*
        ⚠️ 라벨의 「최대 N자」를 시안에서 글자로 옮기지 않고 `lib/apply.ts`의
        상수에서 뽑는다. 지금은 두 값이 시안과 같지만(120·60), 그 숫자는
        리더보드 행에 뜨는 폭을 보고 언제든 다시 끊는 값이라 라벨에 박아 두면
        제한이 바뀔 때 라벨만 거짓말이 된다. 화면 제한(`maxLength`)과 서버
        검증과 라벨이 같은 상수 하나를 본다.
      */}
      <Field
        label="아이디어명"
        note={`최대 ${IDEA_TITLE_MAX}자`}
        htmlFor="ideaTitle"
      >
        <Input
          id="ideaTitle"
          name="ideaTitle"
          type="text"
          maxLength={IDEA_TITLE_MAX}
          defaultValue={state.values?.ideaTitle ?? ""}
          aria-invalid={state.errors?.ideaTitle ? true : undefined}
          aria-describedby={
            state.errors?.ideaTitle ? "ideaTitle-error" : undefined
          }
        />
        {state.errors?.ideaTitle?.[0] ? (
          <p className={styles.fieldError} id="ideaTitle-error">
            {state.errors.ideaTitle[0]}
          </p>
        ) : null}
      </Field>

      <Field label="아이디어 소개" note="선택" htmlFor="ideaSummary">
        <Textarea
          id="ideaSummary"
          name="ideaSummary"
          maxLength={IDEA_SUMMARY_MAX}
          placeholder="어떤 문제를 누구를 위해 풀려는지 짧게 적어 주세요."
          defaultValue={state.values?.ideaSummary ?? ""}
          aria-invalid={state.errors?.ideaSummary ? true : undefined}
          aria-describedby={
            state.errors?.ideaSummary ? "ideaSummary-error" : undefined
          }
        />
        {state.errors?.ideaSummary?.[0] ? (
          <p className={styles.fieldError} id="ideaSummary-error">
            {state.errors.ideaSummary[0]}
          </p>
        ) : null}
      </Field>

      <Field label="팀명" note={`최대 ${TEAM_NAME_MAX}자`} htmlFor="teamName">
        <Input
          id="teamName"
          name="teamName"
          type="text"
          maxLength={TEAM_NAME_MAX}
          defaultValue={state.values?.teamName ?? defaultTeamName}
          aria-invalid={state.errors?.teamName ? true : undefined}
          aria-describedby={
            state.errors?.teamName ? "teamName-error" : undefined
          }
        />
        {state.errors?.teamName?.[0] ? (
          <p className={styles.fieldError} id="teamName-error">
            {state.errors.teamName[0]}
          </p>
        ) : null}
      </Field>

      {/*
        ⚠️ **기본은 해제(=팀 참가)다.** 시안의 `checked`는 채워진 상태를 보여
        주는 목업이 아니라 아예 없고(2110행), 초대 칸은 이 체크박스가 꺼져
        있을 때만 보인다(337행). 그래서 폼이 열리면 초대 칸이 이미 펼쳐져 있다.
        접고 펴는 일은 React가 아니라 CSS가 한다 — ApplyForm.module.css 주석.
      */}
      <div className={styles.soloRow}>
        <input
          type="checkbox"
          id="isSolo"
          name="isSolo"
          value="on"
          defaultChecked={state.values?.isSolo ?? false}
        />
        <label htmlFor="isSolo">혼자 참가할래요 (개인 참가)</label>
      </div>

      <Field
        className={styles.invite}
        label="팀원 초대 이메일"
        note="본인 제외 1인"
        htmlFor="inviteEmail"
        hint={<Clauses text="초대 메일이 발송되고, 수락하면 팀이 완성돼요." />}
      >
        <Input
          id="inviteEmail"
          name="inviteEmail"
          type="email"
          autoComplete="off"
          /* 라벨에는 안 적는다 — 시안이 「본인 제외 1인」만 적었고, 이메일에
             글자 수 한도를 말해 주는 것은 읽는 사람에게 할 일이 아니다 */
          maxLength={INVITE_EMAIL_MAX}
          placeholder="teammate@example.com"
          defaultValue={state.values?.inviteEmail ?? ""}
          aria-invalid={state.errors?.inviteEmail ? true : undefined}
          aria-describedby={
            state.errors?.inviteEmail ? "inviteEmail-error" : undefined
          }
        />
        {state.errors?.inviteEmail?.[0] ? (
          <p className={styles.fieldError} id="inviteEmail-error">
            {state.errors.inviteEmail[0]}
          </p>
        ) : null}
      </Field>

      {/*
        ⚠️ **필수 동의도 기본 해제다.** 시안의 `checked` 둘은 채워진 상태를
        보여 주는 목업이고, 미리 켜 두면 D4 위반이자 다크패턴이다.

        문안 정본은 `content/consent.ts`의 APPLY_CONSENTS다. 여기서 항목을
        세지 않고 순회만 하므로 배열이 바뀌면 그대로 따라간다.
      */}
      <ConsentFields
        className={styles.consents}
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

      {/*
        시안은 버튼 크기를 자리마다 인라인으로 준다(Button.tsx 주석).
        `width:100%;padding:14px;font-size:15px` — `lg`(13px 24px / 15px)와
        패딩이 달라 size로 반올림하지 않고 시안 값을 그대로 붙인다.

        전송 중에만 진짜 disabled를 건다. 동의가 비었다고 버튼을 잠그면
        "왜 안 되는지"를 설명할 자리가 사라진다(OnboardingForm과 같은 규칙).
      */}
      <Button
        type="submit"
        variant="primary"
        block
        style={{ padding: "14px", fontSize: "15px" }}
        disabled={pending}
      >
        {pending ? "접수 중…" : "참가 신청하기"}
      </Button>
    </form>
  );
}
