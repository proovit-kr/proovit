"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import {
  AI_CHECKS,
  BUILDERS,
  LAUNCH_CHECKS,
  S3_FIELDS,
} from "@/content/submission";
import { BUILDER_OTHER_MAX, MEMO_MAX } from "@/lib/submission";

import { saveStage3, type SubmitState } from "./actions";

import fieldStyles from "@/components/ProfileFields.module.css";
import styles from "./submit.module.css";

/*
  s3 제출 폼 — PLN6 4장 s3 표.

  「출시 전 점검」은 운영규칙서 제6장 체크리스트가 정본이고 그 문서가 "배포 버튼을
  누르기 전"에 쓰라고 정한 것이다. 그래서 이 폼은 제출 서류이자 배포 전 점검표다.

  PART B(AI 표시)는 **생성형 AI 기능을 제공하는 참가작만** 해당한다(체크리스트 B0).
  해당 없는 팀에게 다섯 칸을 더 보이면 체크만 하고 지나가게 되고, 그러면 표시
  의무를 실제로 확인한 팀과 구분이 안 된다.
*/

export type S3Defaults = {
  serviceUrl: string;
  builder: string;
  builderOther: string;
  signupConnected: boolean;
  paymentReturnRegistered: boolean;
  launchChecks: boolean[];
  aiFeature: boolean;
  aiChecks: boolean[];
  memo: string;
};

const INITIAL: SubmitState = {};

export function S3Form({
  defaults,
  canWrite,
  askPaymentReturn,
}: {
  defaults: S3Defaults;
  canWrite: boolean;
  /** 결제형 팀에게만 묻는다 — PLN6 「수익화 시」 */
  askPaymentReturn: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveStage3, INITIAL);
  const [builder, setBuilder] = useState(defaults.builder || "replit");
  const [aiFeature, setAiFeature] = useState(defaults.aiFeature);
  const v = state.values;
  const err = state.errors;

  return (
    <form action={formAction} className={styles.form} noValidate>
      {state.message ? (
        <p className={styles.formError} role="alert">
          {state.message}
        </p>
      ) : null}
      {state.done === "draft" ? (
        <p className={styles.saved} role="status">
          임시 저장했습니다. 아직 제출되지 않았습니다.
        </p>
      ) : null}
      {state.done === "submitted" ? (
        <p className={styles.saved} role="status">
          제출했습니다. 마감 전까지 다시 고쳐 낼 수 있습니다.
        </p>
      ) : null}

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="serviceUrl">
          {S3_FIELDS.serviceUrl.label}
        </label>
        <p className={fieldStyles.hint}>
          <span>{S3_FIELDS.serviceUrl.hint}</span>
        </p>
        <input
          className="input"
          id="serviceUrl"
          name="serviceUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          defaultValue={v?.serviceUrl ?? defaults.serviceUrl}
          disabled={!canWrite}
        />
        {err?.serviceUrl?.[0] ? (
          <p className={fieldStyles.fieldError}>{err.serviceUrl[0]}</p>
        ) : null}
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={fieldStyles.label}>{S3_FIELDS.builder.label}</legend>
        <p className={fieldStyles.hint}>
          <span>{S3_FIELDS.builder.hint}</span>
        </p>
        <div className={styles.choices}>
          {BUILDERS.map((item) => (
            <label key={item.value} className={styles.choice}>
              <input
                type="radio"
                name="builder"
                value={item.value}
                checked={builder === item.value}
                onChange={() => setBuilder(item.value)}
                disabled={!canWrite}
              />
              <span className={styles.choiceBody}>
                <span className={styles.choiceLabel}>{item.label}</span>
                <span className={styles.choiceDesc}>{item.note}</span>
              </span>
            </label>
          ))}
        </div>
        {builder === "other" ? (
          <input
            className="input"
            name="builderOther"
            aria-label="빌더 이름"
            maxLength={BUILDER_OTHER_MAX}
            placeholder="예: Lovable, Cursor, 직접 개발"
            defaultValue={v?.builderOther ?? defaults.builderOther}
            disabled={!canWrite}
          />
        ) : null}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={fieldStyles.label}>
          {S3_FIELDS.signupConnected.label}
        </legend>
        <p className={fieldStyles.hint}>
          <span>{S3_FIELDS.signupConnected.hint}</span>
        </p>
        <label className={styles.check}>
          <input
            type="checkbox"
            name="signupConnected"
            defaultChecked={defaults.signupConnected}
            disabled={!canWrite}
          />
          <span>가입 기능을 붙였고 실제로 가입이 됩니다</span>
        </label>
      </fieldset>

      {askPaymentReturn ? (
        <fieldset className={styles.fieldset}>
          <legend className={fieldStyles.label}>
            {S3_FIELDS.paymentReturn.label}
          </legend>
          <p className={fieldStyles.hint}>
            <span>{S3_FIELDS.paymentReturn.hint}</span>
          </p>
          <label className={styles.check}>
            <input
              type="checkbox"
              name="paymentReturn"
              defaultChecked={defaults.paymentReturnRegistered}
              disabled={!canWrite}
            />
            <span>결제 복귀 주소를 팀 서브도메인으로 등록했습니다</span>
          </label>
        </fieldset>
      ) : null}

      <fieldset className={styles.fieldset}>
        <legend className={fieldStyles.label}>출시 전 점검 — 개인정보</legend>
        <p className={fieldStyles.hint}>
          <span>
            운영규칙 제22조가 정한 자가점검입니다. 전 항목을 확인한 뒤 배포하고,
            미충족 항목이 있으면 고친 뒤 배포합니다.
          </span>
          <span>
            참가작의 개인정보처리자는 참가팀 본인이며, 이 점검이 법적 책임을
            대신하지 않습니다.
          </span>
        </p>
        {LAUNCH_CHECKS.map((item, i) => (
          <label key={item.key} className={styles.check}>
            <input
              type="checkbox"
              name={`launch${i}`}
              defaultChecked={defaults.launchChecks[i] ?? false}
              disabled={!canWrite}
            />
            <span>
              <span className={styles.checkKey}>{item.key}</span> {item.label}
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={fieldStyles.label}>출시 전 점검 — AI 표시</legend>
        <p className={fieldStyles.hint}>
          <span>
            생성형 AI가 만든 결과물을 이용자에게 보여주는 참가작만 해당합니다.
            남이 만든 콘텐츠를 보여주기만 한다면 해당하지 않습니다.
          </span>
        </p>
        <label className={styles.check}>
          <input
            type="checkbox"
            name="aiFeature"
            checked={aiFeature}
            onChange={(event) => setAiFeature(event.target.checked)}
            disabled={!canWrite}
          />
          <span>우리 참가작은 생성형 AI 기능을 제공합니다</span>
        </label>
        {aiFeature
          ? AI_CHECKS.map((item, i) => (
              <label key={item.key} className={styles.check}>
                <input
                  type="checkbox"
                  name={`ai${i}`}
                  defaultChecked={defaults.aiChecks[i] ?? false}
                  disabled={!canWrite}
                />
                <span>
                  <span className={styles.checkKey}>{item.key}</span>{" "}
                  {item.label}
                </span>
              </label>
            ))
          : null}
      </fieldset>

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="memo">
          {S3_FIELDS.memo.label}
        </label>
        <p className={fieldStyles.hint}>
          <span>{S3_FIELDS.memo.hint}</span>
        </p>
        <textarea
          className="textarea"
          id="memo"
          name="memo"
          rows={3}
          maxLength={MEMO_MAX}
          defaultValue={v?.memo ?? defaults.memo}
          disabled={!canWrite}
        />
      </div>

      {canWrite ? (
        <div className={styles.actions}>
          <Button
            type="submit"
            name="intent"
            value="submit"
            variant="primary"
            size="lg"
            disabled={pending}
          >
            {pending ? "저장 중…" : "제출하기"}
          </Button>
          <Button
            type="submit"
            name="intent"
            value="draft"
            variant="soft"
            size="lg"
            disabled={pending}
            formNoValidate
          >
            임시 저장
          </Button>
        </div>
      ) : null}
    </form>
  );
}
