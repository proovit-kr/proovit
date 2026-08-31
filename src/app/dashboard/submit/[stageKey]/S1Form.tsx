"use client";

import { useActionState } from "react";

import { Button } from "@/components/Button";
import {
  CHARGE_TYPES,
  CONCEPT_TEMPLATE,
  S1_FIELDS,
  S1_GUIDE_CHECKS,
} from "@/content/submission";
import {
  CONCEPT_MAX,
  CORE_FEATURE_MAX,
  MEMO_MAX,
  NOT_BUILDING_COUNT,
  NOT_BUILDING_MAX,
  PROBLEM_DOC_MAX,
  RISKIEST_MAX,
} from "@/lib/submission";

import { saveStage1, type SubmitState } from "./actions";

import fieldStyles from "@/components/ProfileFields.module.css";
import styles from "./submit.module.css";

/*
  s1 제출 폼 — PLN6 4장 s1 표의 다섯 칸 + 3장 공통(가이드 체크·자기 메모).

  ⚠️ 폼을 감추는 것은 안내일 뿐 방어가 아니다. 실제 차단은 서버 액션이
  `canSubmitStage()`를 다시 부르는 것으로 한다(actions.ts 머리 주석).

  임시 저장 버튼을 먼저 둔 이유: 이 폼은 가이드를 따라 만든 문서를 옮겨 적는
  자리라 한 번에 다 채우기 어렵다. 제출만 있으면 절반 쓴 사람이 창을 닫는다.
*/

export type S1Defaults = {
  concept: string;
  problemDoc: string;
  coreFeature: string;
  notBuilding: string[];
  riskiest: string;
  memo: string;
  guideChecks: boolean[];
  chargeType: string;
};

const INITIAL: SubmitState = {};

export function S1Form({
  defaults,
  chargeTypeLocked,
  canWrite,
}: {
  defaults: S1Defaults;
  chargeTypeLocked: boolean;
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveStage1, INITIAL);
  const v = state.values;
  const err = state.errors;

  /* 되돌려받은 값이 있으면 그것을, 없으면 저장된 값을 채운다 */
  const value = (key: keyof S1Defaults & string, fallback: string) =>
    v?.[key] ?? fallback;

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
        <label className={fieldStyles.label} htmlFor="concept">
          {S1_FIELDS.concept.label}
        </label>
        <p className={fieldStyles.hint}>
          <span>{S1_FIELDS.concept.hint}</span>
          <span className={styles.template}>{CONCEPT_TEMPLATE}</span>
        </p>
        <textarea
          className="textarea"
          id="concept"
          name="concept"
          rows={3}
          maxLength={CONCEPT_MAX}
          defaultValue={value("concept", defaults.concept)}
          disabled={!canWrite}
        />
        <FieldError id="concept-error" messages={err?.concept} />
      </div>

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="problemDoc">
          {S1_FIELDS.problemDoc.label}
        </label>
        <p className={fieldStyles.hint}>
          <span>{S1_FIELDS.problemDoc.hint}</span>
          {/*
            PLN6은 「text 또는 파일」인데 파일 저장소(R2)가 아직 없다.
            없는 기능을 있는 것처럼 적지 않고, 지금 되는 방법만 말한다.
          */}
          <span>파일 첨부는 준비 중이라 지금은 본문으로 받습니다.</span>
        </p>
        <textarea
          className="textarea"
          id="problemDoc"
          name="problemDoc"
          rows={12}
          maxLength={PROBLEM_DOC_MAX}
          defaultValue={value("problemDoc", defaults.problemDoc)}
          disabled={!canWrite}
        />
        <FieldError id="problemDoc-error" messages={err?.problemDoc} />
      </div>

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="coreFeature">
          {S1_FIELDS.coreFeature.label}
        </label>
        <p className={fieldStyles.hint}>
          <span>{S1_FIELDS.coreFeature.hint}</span>
        </p>
        <input
          className="input"
          id="coreFeature"
          name="coreFeature"
          maxLength={CORE_FEATURE_MAX}
          defaultValue={value("coreFeature", defaults.coreFeature)}
          disabled={!canWrite}
        />
        <FieldError id="coreFeature-error" messages={err?.coreFeature} />
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={fieldStyles.label}>
          {S1_FIELDS.notBuilding.label}
        </legend>
        <p className={fieldStyles.hint}>
          <span>{S1_FIELDS.notBuilding.hint}</span>
        </p>
        {Array.from({ length: NOT_BUILDING_COUNT }, (_, i) => (
          <input
            key={i}
            className="input"
            name={`notBuilding${i}`}
            aria-label={`${S1_FIELDS.notBuilding.label} ${i + 1}`}
            maxLength={NOT_BUILDING_MAX}
            defaultValue={
              v?.[`notBuilding${i}`] ?? defaults.notBuilding[i] ?? ""
            }
            disabled={!canWrite}
          />
        ))}
        <FieldError id="notBuilding-error" messages={err?.notBuilding} />
      </fieldset>

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="riskiest">
          {S1_FIELDS.riskiest.label}
        </label>
        <p className={fieldStyles.hint}>
          <span>{S1_FIELDS.riskiest.hint}</span>
        </p>
        <textarea
          className="textarea"
          id="riskiest"
          name="riskiest"
          rows={3}
          maxLength={RISKIEST_MAX}
          defaultValue={value("riskiest", defaults.riskiest)}
          disabled={!canWrite}
        />
        <FieldError id="riskiest-error" messages={err?.riskiest} />
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={fieldStyles.label}>과금 유형</legend>
        <p className={fieldStyles.hint}>
          <span>2차 심사의 수익화 트랙이 이 값으로 갈립니다.</span>
          <span>
            {chargeTypeLocked
              ? "이미 제출해서 바꿀 수 없습니다."
              : "제출한 뒤에는 바꿀 수 없습니다."}
          </span>
        </p>
        <div className={styles.choices}>
          {CHARGE_TYPES.map((type) => (
            <label key={type.value} className={styles.choice}>
              <input
                type="radio"
                name="chargeType"
                value={type.value}
                defaultChecked={
                  (v?.chargeType ?? defaults.chargeType) === type.value
                }
                disabled={!canWrite || chargeTypeLocked}
              />
              <span className={styles.choiceBody}>
                <span className={styles.choiceLabel}>{type.label}</span>
                <span className={styles.choiceDesc}>{type.desc}</span>
              </span>
            </label>
          ))}
        </div>
        {/*
          잠겼을 때도 값은 폼에 실어 보낸다 — 라디오를 disabled로 두면 FormData에서
          빠지고, 서버가 기본값(결제형)으로 읽어 문의형 팀의 값이 뒤집힌다.
        */}
        {chargeTypeLocked ? (
          <input type="hidden" name="chargeType" value={defaults.chargeType} />
        ) : null}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={fieldStyles.label}>가이드 완료 체크</legend>
        <p className={fieldStyles.hint}>
          <span>세 항목을 모두 확인해야 제출할 수 있습니다.</span>
        </p>
        {S1_GUIDE_CHECKS.map((item, i) => (
          <label key={item} className={styles.check}>
            <input
              type="checkbox"
              name={`guide${i}`}
              defaultChecked={defaults.guideChecks[i] ?? false}
              disabled={!canWrite}
            />
            <span>{item}</span>
          </label>
        ))}
      </fieldset>

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="memo">
          {S1_FIELDS.memo.label}
        </label>
        <p className={fieldStyles.hint}>
          <span>{S1_FIELDS.memo.hint}</span>
        </p>
        <textarea
          className="textarea"
          id="memo"
          name="memo"
          rows={3}
          maxLength={MEMO_MAX}
          defaultValue={value("memo", defaults.memo)}
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

function FieldError({
  id,
  messages,
}: {
  id: string;
  messages: string[] | undefined;
}) {
  if (!messages?.[0]) return null;
  return (
    <p className={fieldStyles.fieldError} id={id}>
      {messages[0]}
    </p>
  );
}
