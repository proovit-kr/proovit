"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { MEMO_MAX } from "@/lib/submission";

import { saveStage2, saveStage4, saveStage5, type SubmitState } from "./actions";
import {
  ACTIVITY_MAX,
  CHANNEL_MAX,
  IMPROVED_MAX,
  RETRO_MAX,
  S2_FIELDS,
  S2_GUIDE_CHECKS,
  S4_FIELDS,
  S4_GUIDE_CHECKS,
  S5_FIELDS,
  S5_GUIDE_CHECKS,
} from "./stages";

import fieldStyles from "@/components/ProfileFields.module.css";
import styles from "./submit.module.css";

/*
  s2·s4·s5 제출 폼 — 시안 ver4 `#scr-submit`의 같은 이름 패널.

  ⚠️ **지표 칸은 폼이 아니다.** 시안이 `.ro`(read-only)와 자물쇠로 그린 자리를
  입력으로 옮기면 참가자가 숫자를 적게 되고, 그 순간 「참가자가 숫자를 입력하지
  않는다」는 약속이 깨진다. 그래서 그 칸은 서버 컴포넌트(page.tsx)가 집계값으로
  그리고, 이 파일은 **서술과 체크만** 받는다.

  세 폼을 한 파일에 둔 것은 뼈대가 같아서다 — 상태 배너, 가이드 체크, 메모,
  제출·임시저장 버튼이 셋 다 똑같다. 갈라야 할 만큼 커지면 그때 나눈다.
*/

const INITIAL: SubmitState = {};

/** 저장 결과 배너. 세 폼이 같은 문구를 쓴다 */
function Banner({ state }: { state: SubmitState }) {
  return (
    <>
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
    </>
  );
}

/** 가이드 완료 체크. 순서가 곧 뜻이라 인덱스를 이름에 박는다 */
function GuideChecks({
  items,
  defaults,
  canWrite,
  chapter,
}: {
  items: string[];
  defaults: boolean[];
  canWrite: boolean;
  chapter: string;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={fieldStyles.label}>가이드 완료 체크</legend>
      <p className={fieldStyles.hint}>
        <span>{chapter} 완료 체크와 1:1입니다.</span>
      </p>
      {items.map((label, i) => (
        <label key={label} className={styles.check}>
          <input
            type="checkbox"
            name={`guide${i}`}
            defaultChecked={defaults[i] ?? false}
            disabled={!canWrite}
          />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** 자기 메모. 심사에 반영되지 않는다는 것을 매번 적는다 */
function MemoField({
  defaultValue,
  canWrite,
  placeholder,
}: {
  defaultValue: string;
  canWrite: boolean;
  placeholder?: string;
}) {
  return (
    <div className={fieldStyles.field}>
      <label className={fieldStyles.label} htmlFor="memo">
        자기 메모
      </label>
      <p className={fieldStyles.hint}>
        <span>심사에 반영되지 않습니다.</span>
      </p>
      <textarea
        className="textarea"
        id="memo"
        name="memo"
        rows={3}
        maxLength={MEMO_MAX}
        placeholder={placeholder}
        defaultValue={defaultValue}
        disabled={!canWrite}
      />
    </div>
  );
}

/*
  채널 태그.

  시안은 Enter로 칩을 쌓는다. 같은 이름(`channels`)으로 여러 값을 보내면
  `formData.getAll`이 그대로 배열로 받으므로, 칩 하나가 hidden input 하나다.
*/
function ChannelTags({
  label,
  hint,
  defaults,
  canWrite,
  error,
}: {
  label: string;
  hint: string;
  defaults: string[];
  canWrite: boolean;
  error?: string;
}) {
  const [tags, setTags] = useState<string[]>(defaults);
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value || tags.includes(value)) return;
    setTags([...tags, value]);
    setDraft("");
  };

  return (
    <div className={fieldStyles.field}>
      <span className={fieldStyles.label}>{label}</span>
      <p className={fieldStyles.hint}>
        <span>{hint}</span>
      </p>
      <div className={styles.tags}>
        {tags.map((tag) => (
          <span key={tag} className={styles.tag}>
            <input type="hidden" name="channels" value={tag} />
            {tag}
            {canWrite ? (
              <button
                type="button"
                aria-label={`${tag} 지우기`}
                onClick={() => setTags(tags.filter((item) => item !== tag))}
              >
                ×
              </button>
            ) : null}
          </span>
        ))}
        {canWrite ? (
          <input
            className={styles.tagInput}
            value={draft}
            maxLength={CHANNEL_MAX}
            aria-label={`${label} 입력`}
            placeholder="채널 입력 후 Enter"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              /* Enter가 폼을 보내지 않게 막는다 — 칩을 쌓는 키다 */
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            onBlur={add}
          />
        ) : null}
      </div>
      {error ? <p className={fieldStyles.fieldError}>{error}</p> : null}
    </div>
  );
}

/** 제출·임시저장 버튼 묶음 */
function Actions({
  pending,
  submitLabel,
  draftable = true,
}: {
  pending: boolean;
  submitLabel: string;
  draftable?: boolean;
}) {
  return (
    <div className={styles.actions}>
      <Button
        type="submit"
        name="intent"
        value="submit"
        variant="primary"
        size="lg"
        disabled={pending}
      >
        {pending ? "저장 중…" : submitLabel}
      </Button>
      {draftable ? (
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
      ) : null}
    </div>
  );
}

// ── s2 ───────────────────────────────────────────────────────

export type S2Defaults = {
  landingUrl: string;
  channels: string[];
  postUrl: string;
  guideChecks: boolean[];
  memo: string;
};

export function S2Form({
  defaults,
  canWrite,
}: {
  defaults: S2Defaults;
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveStage2, INITIAL);
  const v = state.values;
  const err = state.errors as Record<string, string[] | undefined> | undefined;

  return (
    <form action={formAction} className={styles.form} noValidate>
      <Banner state={state} />

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="landingUrl">
          {S2_FIELDS.landingUrl.label}
        </label>
        <p className={fieldStyles.hint}>
          <span>{S2_FIELDS.landingUrl.hint}</span>
        </p>
        <input
          className="input"
          id="landingUrl"
          name="landingUrl"
          type="url"
          inputMode="url"
          placeholder="https://팀명.proovit.kr"
          defaultValue={v?.landingUrl ?? defaults.landingUrl}
          disabled={!canWrite}
        />
        {err?.landingUrl?.[0] ? (
          <p className={fieldStyles.fieldError}>{err.landingUrl[0]}</p>
        ) : null}
      </div>

      <ChannelTags
        label={S2_FIELDS.channels.label}
        hint={S2_FIELDS.channels.hint}
        defaults={defaults.channels}
        canWrite={canWrite}
        error={err?.channels?.[0]}
      />

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="postUrl">
          {S2_FIELDS.postUrl.label}
        </label>
        <p className={fieldStyles.hint}>
          <span>{S2_FIELDS.postUrl.hint}</span>
        </p>
        <input
          className="input"
          id="postUrl"
          name="postUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          defaultValue={v?.postUrl ?? defaults.postUrl}
          disabled={!canWrite}
        />
        {err?.postUrl?.[0] ? (
          <p className={fieldStyles.fieldError}>{err.postUrl[0]}</p>
        ) : null}
      </div>

      <GuideChecks
        items={S2_GUIDE_CHECKS}
        defaults={defaults.guideChecks}
        canWrite={canWrite}
        chapter="가이드 CH.2"
      />
      <MemoField defaultValue={v?.memo ?? defaults.memo} canWrite={canWrite} />

      {canWrite ? <Actions pending={pending} submitLabel="제출하기" /> : null}
    </form>
  );
}

// ── s4 ───────────────────────────────────────────────────────

export type S4Defaults = {
  activity: string;
  channels: string[];
  improved: string;
  guideChecks: boolean[];
  memo: string;
};

export function S4Form({
  defaults,
  canWrite,
  week,
}: {
  defaults: S4Defaults;
  canWrite: boolean;
  /** 주차는 시스템이 정한다. 폼은 그대로 되돌려 보낸다 */
  week: number;
}) {
  const [state, formAction, pending] = useActionState(saveStage4, INITIAL);
  const v = state.values;
  const err = state.errors as Record<string, string[] | undefined> | undefined;

  return (
    <form action={formAction} className={styles.form} noValidate>
      <input type="hidden" name="week" value={week} />
      <Banner state={state} />

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="activity">
          {S4_FIELDS.activity.label}
        </label>
        <p className={fieldStyles.hint}>
          <span>{S4_FIELDS.activity.hint}</span>
        </p>
        <textarea
          className="textarea"
          id="activity"
          name="activity"
          rows={4}
          maxLength={ACTIVITY_MAX}
          defaultValue={v?.activity ?? defaults.activity}
          disabled={!canWrite}
        />
        {err?.activity?.[0] ? (
          <p className={fieldStyles.fieldError}>{err.activity[0]}</p>
        ) : null}
      </div>

      <ChannelTags
        label={S4_FIELDS.channels.label}
        hint={S4_FIELDS.channels.hint}
        defaults={defaults.channels}
        canWrite={canWrite}
        error={err?.channels?.[0]}
      />

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="improved">
          {S4_FIELDS.improved.label}
        </label>
        <p className={fieldStyles.hint}>
          <span>{S4_FIELDS.improved.hint}</span>
        </p>
        <input
          className="input"
          id="improved"
          name="improved"
          maxLength={IMPROVED_MAX}
          placeholder="예: 가입 폼 필드 6개 → 2개로 축소"
          defaultValue={v?.improved ?? defaults.improved}
          disabled={!canWrite}
        />
      </div>

      <GuideChecks
        items={S4_GUIDE_CHECKS}
        defaults={defaults.guideChecks}
        canWrite={canWrite}
        chapter="가이드 CH.6"
      />
      <MemoField
        defaultValue={v?.memo ?? defaults.memo}
        canWrite={canWrite}
        placeholder="이번 주에 배운 것"
      />

      {canWrite ? (
        <Actions pending={pending} submitLabel="이번 주 제출하기" />
      ) : null}
    </form>
  );
}

// ── s5 ───────────────────────────────────────────────────────

export type S5Defaults = {
  monetized: boolean;
  paymentConnected: boolean;
  retro: string;
  guideChecks: boolean[];
  archiveConsent: boolean;
  memo: string;
};

export function S5Form({
  defaults,
  canWrite,
  paymentVerified,
}: {
  defaults: S5Defaults;
  canWrite: boolean;
  /** 결제 연동 화면이 확인한 상태. 신고값과 대조해 보여준다 */
  paymentVerified: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveStage5, INITIAL);
  const [monetized, setMonetized] = useState(defaults.monetized);
  const v = state.values;
  const err = state.errors as Record<string, string[] | undefined> | undefined;

  return (
    <form action={formAction} className={styles.form} noValidate>
      <Banner state={state} />

      <fieldset className={styles.fieldset}>
        <legend className={fieldStyles.label}>수익화 시도 여부</legend>
        <p className={fieldStyles.hint}>
          <span>매출은 가산점입니다. 없어도 괜찮습니다.</span>
        </p>
        <label className={styles.check}>
          <input
            type="checkbox"
            name="monetized"
            checked={monetized}
            onChange={(event) => setMonetized(event.target.checked)}
            disabled={!canWrite}
          />
          <span>이번 시즌에 수익화를 시도했습니다</span>
        </label>
      </fieldset>

      {/* 수익화를 안 했으면 결제 연동을 물을 이유가 없다 */}
      {monetized ? (
        <fieldset className={styles.fieldset}>
          <legend className={fieldStyles.label}>결제 연동 여부</legend>
          <p className={fieldStyles.hint}>
            <span>연동 화면이 확인한 상태와 대조됩니다.</span>
            <span>
              현재 연동 상태 — {paymentVerified ? "연동 확인됨" : "미확인"}
            </span>
          </p>
          <label className={styles.check}>
            <input
              type="checkbox"
              name="paymentConnected"
              defaultChecked={defaults.paymentConnected}
              disabled={!canWrite}
            />
            <span>결제 연동을 마쳤습니다</span>
          </label>
        </fieldset>
      ) : null}

      <div className={fieldStyles.field}>
        <label className={fieldStyles.label} htmlFor="retro">
          {S5_FIELDS.retro.label}
        </label>
        <p className={fieldStyles.hint}>
          <span>{S5_FIELDS.retro.hint}</span>
        </p>
        <textarea
          className="textarea"
          id="retro"
          name="retro"
          rows={6}
          maxLength={RETRO_MAX}
          placeholder="5주 동안 무엇을 배웠나요?"
          defaultValue={v?.retro ?? defaults.retro}
          disabled={!canWrite}
        />
        {err?.retro?.[0] ? (
          <p className={fieldStyles.fieldError}>{err.retro[0]}</p>
        ) : null}
      </div>

      <GuideChecks
        items={S5_GUIDE_CHECKS}
        defaults={defaults.guideChecks}
        canWrite={canWrite}
        chapter="가이드 CH.8"
      />
      <MemoField
        defaultValue={v?.memo ?? defaults.memo}
        canWrite={canWrite}
        placeholder="다음 시즌의 나에게 남길 말"
      />

      <fieldset className={styles.fieldset}>
        <legend className={fieldStyles.label}>아카이브 공개 동의</legend>
        <label className={styles.check}>
          <input
            type="checkbox"
            name="archiveConsent"
            defaultChecked={defaults.archiveConsent}
            disabled={!canWrite}
          />
          <span>
            <span className={styles.req}>[필수]</span> 최종 지표와 회고를 시즌
            아카이브에 공개하는 것에 동의합니다
          </span>
        </label>
        {err?.archiveConsent?.[0] ? (
          <p className={fieldStyles.fieldError}>{err.archiveConsent[0]}</p>
        ) : null}
      </fieldset>

      {canWrite ? (
        <Actions pending={pending} submitLabel="최종 제출 확인" />
      ) : null}
    </form>
  );
}
