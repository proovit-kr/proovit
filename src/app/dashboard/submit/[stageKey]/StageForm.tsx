"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Field, Input, Select, SwitchRow, Textarea } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/Surface";
import { Toast, useToast } from "@/components/Toast";
import {
  AI_CHECKS,
  AI_GATE,
  BUILDERS,
  CHARGE_TYPES,
  EVIDENCE_FIELD,
  GUIDE_CHECKS,
  GUIDE_LABEL,
  LAUNCH_CHECKS,
  MEMO_FIELD,
  S1_COUNT_NOTE,
  S1_FIELDS,
  S1_GROUPS,
  S2_FIELDS,
  S3_FIELDS,
  S4_FIELDS,
  S5_FIELDS,
  SUBMIT_BUTTONS,
  WEEK_CHIP,
  guideNote,
} from "@/content/submission";
import {
  ACTIVITY_MAX,
  ALTERNATIVE_COUNT,
  ALTERNATIVE_MAX,
  BUILDER_OTHER_MAX,
  BUILD_PLAN_MAX,
  CONCEPT_MAX,
  CORE_FEATURE_MAX,
  DIFFERENTIATION_MAX,
  HYPOTHESIS_MAX,
  IMPROVED_MAX,
  LINK_MAX,
  MEMO_MAX,
  MONETIZATION_MAX,
  NOT_BUILDING_COUNT,
  NOT_BUILDING_MAX,
  PERSONA_MAX,
  PRICING_MAX,
  PROBLEM_DOC_MAX,
  PROBLEM_MAX,
  RETRO_MAX,
  RISKIEST_MAX,
  SURVEY_SHORT_MAX,
  SURVEY_STRANGER,
  SURVEY_SUMMARY_MAX,
  TIMELINE_MAX,
} from "@/lib/submission";
import type { FormDefaults } from "@/lib/submission-fields";

import fieldStyles from "@/components/Field.module.css";
import hub from "../../hub.module.css";
import { saveStageAction, type SubmitState } from "./actions";
import { Check, Counted, Files, GuideChecks, No, ReadOnly, Seg, Tags } from "./parts";

import styles from "./submit.module.css";

/*
  스테이지 제출의 폼 상자 — 시안 `#scr-submit`의 `.pane.frm` 다섯 판. 머리(`.frm-hd`)·
  메타(`.frm-meta`)·안내줄·칸들·발자국(`.frm-ft`)까지 상자 하나가 폼 하나다.

  ⚠️ 여기서 버튼을 감추거나 잠그는 것은 **안내일 뿐 방어가 아니다.** 실제 차단은
  서버 액션이 `canSubmitStage`를 다시 부르는 것으로 한다(actions.ts 머리 주석).

  시안과 일부러 다른 것(내가 정함, 2026-09-22, 수연 확인 대기):
    · 증빙 파일의 드롭 칸(`.drop`)은 열린 판에만 그린다. 시안은 잠긴 s2에 칩만 있고
      작성 중인 s4에도 칩만 있는데, 올릴 수 있는 판에 올릴 자리가 없을 수 없다.
    · 파일 이름이 곧 링크다(새 탭). 시안은 글자만이다.
    · 아직 안 열린 판(s5 「예정」)은 칸과 버튼을 잠근다. 시안은 눌리는 모양이다.
    · s3 「기타」 빌더를 고르면 이름 칸이 하나 더 열린다(시안에 없다).
    · 임시저장 표기에 이름이 없다(「임시저장 10.15 02:11」) — 저장한 사람을 남기는
      칸이 없고, 임시저장은 팀장만 하므로 이름이 곧 팀장이다.
  대조 스크립트(`submit.mjs`)는 그 자리를 재지 않는다.

  `data-probe`·`data-state`는 대조 스크립트가 지금 어느 판인지 읽는 표식이다.
*/

export type StageActions =
  | { kind: "pair"; submitLabel: string; resubmit: boolean; disabled: boolean }
  | { kind: "final"; disabled: boolean }
  | { kind: "locked"; label: string }
  | { kind: "none" };

export type StageFormProps = {
  stageKey: "s1" | "s2" | "s3" | "s4" | "s5";
  title: string;
  chip: string;
  gate: boolean;
  badge: { tone: "lime" | "red" | "warn" | "gray"; label: string } | null;
  meta: string[];
  info: string | null;
  who: string;
  actions: StageActions;
  /** 칸을 열어 둘지. 팀장이 아니거나 잠긴 판이면 읽기만 */
  canWrite: boolean;
  defaults: FormDefaults;
  s1?: { chargeType: string; chargeTypeLocked: boolean };
  s2?: { range: string; visitors: string; leads: string; conversion: string };
  s4?: {
    weeks: { week: number; state: "done" | "now" | "missed" }[];
    visitors: string;
    signups: string;
  };
  s5?: { cards: { label: string; value: string }[]; paymentLabel: string };
};

const INITIAL: SubmitState = {};

/** 저장·제출 토스트 */
const SAVED = {
  draft: "임시 저장했어요. 아직 제출되지 않았어요.",
  submitted: "제출했어요. 마감 전까지 다시 고쳐 낼 수 있어요.",
} as const;

const ACCENT = { color: "var(--accent)" } as const;

export function StageForm(props: StageFormProps) {
  const { stageKey, defaults, canWrite } = props;
  const [state, formAction, pending] = useActionState(saveStageAction, INITIAL);
  /*
    버튼은 폼 맨 아래고 긴 s1에서는 위가 안 보인다 — 결과는 토스트로 알린다(수연,
    2026-09-23). 저장·제출은 토스트뿐이고, 거부는 위 배너에 이유를 남긴 채 걸린 첫
    칸(없으면 배너)으로 옮겨 준다.
  */
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const bannerRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.done) {
      toast.show(state.done === "draft" ? SAVED.draft : SAVED.submitted);
      return;
    }
    if (!state.message) return;
    toast.show(state.message);
    const target =
      (state.errors && formRef.current?.querySelector(`.${styles.fieldError}`)) ||
      bannerRef.current;
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    /* toast.show는 안정된 참조다 — 응답이 바뀔 때만 돈다 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const v = state.values;

  /* 되돌려받은 값이 있으면 그것을, 없으면 저장된 값을 채운다 */
  const text = (name: string) => v?.[name] ?? defaults.text[name] ?? "";
  const on = (name: string) => (v ? v[name] === "on" : (defaults.on[name] ?? false));
  const channels = state.channels ?? defaults.channels;
  const files = state.files ?? defaults.files;
  const error = (name: string) => state.errors?.[name]?.[0];
  const off = !canWrite || pending;

  const guide = GUIDE_CHECKS[stageKey];

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className={styles.frm}
      data-probe="submit"
      data-state={stageKey}
    >
      <input type="hidden" name="stageKey" value={stageKey} />

      <div className={styles.frmHd}>
        <h2>{props.title}</h2>
        <span className={props.gate ? styles.gateChip : styles.passChip}>{props.chip}</span>
        {props.badge ? <Badge tone={props.badge.tone}>{props.badge.label}</Badge> : null}
      </div>
      <div className={styles.frmMeta}>
        {props.meta.map((line, i) => (
          <span key={i}>{line}</span>
        ))}
      </div>

      {state.message ? (
        <p className={styles.error} role="alert" ref={bannerRef}>
          {state.message}
        </p>
      ) : null}

      {props.info ? (
        <div className={hub.infoStrip}>
          <Icon name="info" fixed /> {props.info}
        </div>
      ) : null}

      {stageKey === "s1" && props.s1 ? (
        <S1Fields text={text} error={error} off={off} locked={!canWrite} files={files} {...props.s1} />
      ) : null}
      {stageKey === "s2" && props.s2 ? (
        <S2Fields text={text} error={error} off={off} locked={!canWrite} files={files} channels={channels} {...props.s2} />
      ) : null}
      {stageKey === "s3" ? (
        <S3Fields text={text} on={on} error={error} off={off} locked={!canWrite} files={files} />
      ) : null}
      {stageKey === "s4" && props.s4 ? (
        <S4Fields text={text} error={error} off={off} locked={!canWrite} files={files} channels={channels} {...props.s4} />
      ) : null}
      {stageKey === "s5" && props.s5 ? (
        <S5Fields text={text} on={on} error={error} off={off} locked={!canWrite} files={files} {...props.s5} />
      ) : null}

      {stageKey !== "s5" ? (
        <Field label={GUIDE_LABEL} note={guideNote(guide.chapter)}>
          <GuideChecks items={guide.items} on={v ? onMap(v) : defaults.on} disabled={off} />
        </Field>
      ) : null}
      {stageKey !== "s5" ? (
        <Field label={MEMO_FIELD.label} note={MEMO_FIELD.note} htmlFor="memo">
          <Textarea
            id="memo"
            name="memo"
            maxLength={MEMO_MAX}
            placeholder={MEMO_FIELD.placeholder[stageKey]}
            defaultValue={text("memo")}
            disabled={off}
          />
        </Field>
      ) : null}
      {stageKey !== "s5" ? (
        <Field
          label={EVIDENCE_FIELD.label}
          note={
            stageKey === "s2" ? (
              <>
                <Icon name="warn" /> {EVIDENCE_FIELD.note.s2}
              </>
            ) : (
              EVIDENCE_FIELD.note[stageKey]
            )
          }
        >
          <Files
            name="evidence"
            stageKey={stageKey}
            slot="evidence"
            defaultValue={files.evidence}
            locked={!canWrite}
            error={error("evidence")}
          />
        </Field>
      ) : null}
      {stageKey === "s1" ? <p className={styles.cntNote}>{S1_COUNT_NOTE}</p> : null}

      <div className={styles.frmFt}>
        <span className={styles.who}>{props.who}</span>
        <Actions actions={props.actions} pending={pending} />
      </div>
      <Toast message={toast.message} />
    </form>
  );
}

/* 되돌려받은 FormData에서 체크박스만 골라 켜짐 표로 */
function onMap(values: Record<string, string>): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value === "on")
      .map(([key]) => [key, true]),
  );
}

function Actions({ actions, pending }: { actions: StageActions; pending: boolean }) {
  if (actions.kind === "none") return null;
  if (actions.kind === "locked") {
    return (
      <span className={styles.sp}>
        <Button type="button" variant="gray" disabled>
          {actions.label}
        </Button>
      </span>
    );
  }
  if (actions.kind === "final") {
    return (
      <span className={styles.sp}>
        <Button
          type="submit"
          name="intent"
          value="submit"
          variant="primary"
          disabled={actions.disabled || pending}
        >
          {pending ? "저장하는 중…" : SUBMIT_BUTTONS.final}
        </Button>
      </span>
    );
  }
  return (
    <span className={styles.sp}>
      <Button
        type="submit"
        name="intent"
        value="draft"
        variant="ghost"
        disabled={actions.disabled || pending}
        formNoValidate
      >
        {SUBMIT_BUTTONS.draft}
      </Button>
      <Button
        type="submit"
        name="intent"
        value="submit"
        variant={actions.resubmit ? "outline" : "primary"}
        disabled={actions.disabled || pending}
      >
        {pending ? "저장하는 중…" : actions.submitLabel}
      </Button>
    </span>
  );
}

type FieldTools = {
  text: (name: string) => string;
  error: (name: string) => string | undefined;
  off: boolean;
  /** 잠긴 판 — 드롭 칸을 안 그린다. `off`는 저장 중에도 참이라 따로 둔다 */
  locked: boolean;
  files: FormDefaults["files"];
};

/** 시안 `.fgrp` — 대분류 머리 */
function Group({ n, title, note }: { n: string; title: string; note: string | null }) {
  return (
    <div className={styles.fgrp}>
      <span className={styles.n}>{n}</span>
      <b>{title}</b>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

// ── s1 ───────────────────────────────────────────────────────

function S1Fields({
  text,
  error,
  off,
  locked,
  files,
  chargeType,
  chargeTypeLocked,
}: FieldTools & { chargeType: string; chargeTypeLocked: boolean }) {
  const f = S1_FIELDS;
  /* 본문 없이 파일만 있으면 파일 쪽을 연다. 감춘 쪽의 값도 폼에 실린다 */
  const [docMode, setDocMode] = useState(
    !text("problemDoc") && files.problem.length > 0 ? "file" : "text",
  );
  const docOptions = f.problemDoc.seg.map((label, i) => ({ value: i === 0 ? "text" : "file", label }));
  const surveyOptions = SURVEY_STRANGER.map((value, i) => ({
    value,
    label: f.survey.seg[i],
  }));
  return (
    <>
      <Counted
        label={f.concept.label}
        hint={f.concept.hint}
        name="concept"
        max={CONCEPT_MAX}
        defaultValue={text("concept")}
        disabled={off}
        error={error("concept")}
      />

      <Group {...S1_GROUPS.problem} />
      <Counted
        label={<><No>{f.persona.no}</No>{f.persona.label}</>}
        hint={f.persona.hint}
        name="persona"
        max={PERSONA_MAX}
        defaultValue={text("persona")}
        disabled={off}
        error={error("persona")}
        multiline
      />
      <Counted
        label={<><No>{f.problem.no}</No>{f.problem.label}</>}
        hint={f.problem.hint}
        name="problem"
        max={PROBLEM_MAX}
        defaultValue={text("problem")}
        disabled={off}
        error={error("problem")}
      />
      {/* 시안 `.seg` — 직접 작성/파일 업로드. 둘 중 하나 필수(스키마의 refine) */}
      <Field label={f.problemDoc.label} note={f.problemDoc.note}>
        {/* 보기만 바꾸는 버튼이라 잠긴 판에서도 눌린다 — 올린 파일을 봐야 한다 */}
        <Seg options={docOptions} value={docMode} onChange={setDocMode} />
        <div className={docMode === "text" ? undefined : styles.segPOff}>
          <Textarea
            id="problemDoc"
            name="problemDoc"
            maxLength={PROBLEM_DOC_MAX}
            defaultValue={text("problemDoc")}
            disabled={off}
            aria-label={f.problemDoc.label}
          />
        </div>
        <div className={docMode === "file" ? undefined : styles.segPOff}>
          <Files
            name="problemDocFile"
            stageKey="s1"
            slot="problem"
            defaultValue={files.problem}
            sub={f.problemDoc.dropSub}
            locked={locked}
            error={error("problemDocFiles")}
          />
        </div>
        {error("problemDoc") ? <p className={styles.fieldError}>{error("problemDoc")}</p> : null}
      </Field>

      <Group {...S1_GROUPS.demand} />
      <Field
        label={<><No>{f.survey.no}</No>{f.survey.label}</>}
        note={f.survey.note}
        hint={f.survey.hint}
      >
        <div className={styles.fld2}>
          <Input
            mono
            name="surveyCount"
            maxLength={SURVEY_SHORT_MAX}
            placeholder={f.survey.countPlaceholder}
            defaultValue={text("surveyCount")}
            disabled={off}
            aria-label={f.survey.countPlaceholder}
          />
          <Input
            name="surveyChannel"
            maxLength={SURVEY_SHORT_MAX}
            placeholder={f.survey.channelPlaceholder}
            defaultValue={text("surveyChannel")}
            disabled={off}
            aria-label={f.survey.channelPlaceholder}
          />
        </div>
        <Seg
          name="surveyStranger"
          options={surveyOptions}
          defaultValue={text("surveyStranger") || SURVEY_STRANGER[0]}
          disabled={off}
          className={styles.mb8}
        />
        <Textarea
          name="surveySummary"
          maxLength={SURVEY_SUMMARY_MAX}
          placeholder={f.survey.summaryPlaceholder}
          defaultValue={text("surveySummary")}
          disabled={off}
          aria-label={f.survey.summaryPlaceholder}
        />
      </Field>
      <Counted
        label={<><No>{f.hypothesisChange.no}</No>{f.hypothesisChange.label}</>}
        hint={f.hypothesisChange.hint}
        name="hypothesisChange"
        max={HYPOTHESIS_MAX}
        defaultValue={text("hypothesisChange")}
        disabled={off}
        error={error("hypothesisChange")}
        multiline
      />

      <Group {...S1_GROUPS.differentiation} />
      <Field
        label={<><No>{f.alternatives.no}</No>{f.alternatives.label}</>}
        note={f.alternatives.note}
        hint={f.alternatives.hint}
      >
        {Array.from({ length: ALTERNATIVE_COUNT }, (_, i) => (
          <div key={i} className={styles.pair}>
            <Input
              name={`alt${i}`}
              maxLength={ALTERNATIVE_MAX}
              placeholder={f.alternatives.namePlaceholder}
              defaultValue={text(`alt${i}`)}
              disabled={off}
              aria-label={`${f.alternatives.namePlaceholder} ${i + 1}`}
            />
            <Input
              name={`alt${i}pain`}
              maxLength={ALTERNATIVE_MAX}
              placeholder={f.alternatives.painPlaceholder}
              defaultValue={text(`alt${i}pain`)}
              disabled={off}
              aria-label={`${f.alternatives.painPlaceholder} ${i + 1}`}
            />
          </div>
        ))}
      </Field>
      <Counted
        label={<><No>{f.differentiation.no}</No>{f.differentiation.label}</>}
        hint={f.differentiation.hint}
        name="differentiation"
        max={DIFFERENTIATION_MAX}
        defaultValue={text("differentiation")}
        disabled={off}
        error={error("differentiation")}
        multiline
      />

      <Group {...S1_GROUPS.execution} />
      <Counted
        label={<><No>{f.coreFeature.no}</No>{f.coreFeature.label}</>}
        hint={f.coreFeature.hint}
        name="coreFeature"
        max={CORE_FEATURE_MAX}
        defaultValue={text("coreFeature")}
        disabled={off}
        error={error("coreFeature")}
      />
      <Field label={f.notBuilding.label} note={f.notBuilding.note}>
        {Array.from({ length: NOT_BUILDING_COUNT }, (_, i) => (
          <Input
            key={i}
            name={`notBuilding${i}`}
            maxLength={NOT_BUILDING_MAX}
            defaultValue={text(`notBuilding${i}`)}
            disabled={off}
            className={i < NOT_BUILDING_COUNT - 1 ? styles.mb8 : undefined}
            aria-label={`${f.notBuilding.label} ${i + 1}`}
          />
        ))}
        {error("notBuilding0") || error("notBuilding1") ? (
          <p className={styles.fieldError}>{error("notBuilding0") ?? error("notBuilding1")}</p>
        ) : null}
      </Field>
      <Field
        label={<><No>{f.buildPlan.no}</No>{f.buildPlan.label}</>}
        note={f.buildPlan.note}
        htmlFor="buildPlan"
      >
        <Textarea
          id="buildPlan"
          name="buildPlan"
          maxLength={BUILD_PLAN_MAX}
          defaultValue={text("buildPlan")}
          disabled={off}
        />
      </Field>
      <Field
        label={<><No>{f.timeline.no}</No>{f.timeline.label}</>}
        note={f.timeline.note}
        hint={f.timeline.hint}
        htmlFor="timeline"
      >
        <Textarea
          id="timeline"
          name="timeline"
          maxLength={TIMELINE_MAX}
          defaultValue={text("timeline")}
          disabled={off}
        />
      </Field>

      <Group {...S1_GROUPS.monetization} />
      <Field
        label={<><No>{f.chargeType.no}</No>{f.chargeType.label}</>}
        note={f.chargeType.note}
        hint={f.chargeType.hint}
        htmlFor="chargeType"
      >
        <Select
          id="chargeType"
          name="chargeType"
          defaultValue={chargeType}
          disabled={off || chargeTypeLocked}
        >
          {CHARGE_TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
        {/*
          잠겼을 때도 값은 폼에 실어 보낸다 — disabled select는 FormData에서
          빠지고, 서버가 기본값(결제형)으로 읽어 문의형 팀의 값이 뒤집힌다.
        */}
        {chargeTypeLocked ? <input type="hidden" name="chargeType" value={chargeType} /> : null}
      </Field>
      <Field label={f.pricing.label} note={f.pricing.note} htmlFor="pricing">
        <Input
          id="pricing"
          name="pricing"
          maxLength={PRICING_MAX}
          defaultValue={text("pricing")}
          disabled={off}
        />
      </Field>
      <Counted
        label={f.monetizationPlan.label}
        hint={f.monetizationPlan.hint}
        name="monetizationPlan"
        max={MONETIZATION_MAX}
        defaultValue={text("monetizationPlan")}
        disabled={off}
        error={error("monetizationPlan")}
        multiline
      />

      <Group {...S1_GROUPS.check} />
      <Counted
        label={f.riskiest.label}
        hint={f.riskiest.hint}
        name="riskiest"
        max={RISKIEST_MAX}
        defaultValue={text("riskiest")}
        disabled={off}
        error={error("riskiest")}
        multiline
      />
    </>
  );
}

// ── s2 ───────────────────────────────────────────────────────

function S2Fields({
  text,
  error,
  off,
  channels,
  range,
  visitors,
  leads,
  conversion,
}: FieldTools & {
  channels: string[];
  range: string;
  visitors: string;
  leads: string;
  conversion: string;
}) {
  const f = S2_FIELDS;
  return (
    <>
      <Field label={f.landingUrl.label} note={f.landingUrl.note} htmlFor="landingUrl">
        <Input
          mono
          id="landingUrl"
          name="landingUrl"
          type="url"
          inputMode="url"
          maxLength={LINK_MAX}
          defaultValue={text("landingUrl")}
          disabled={off}
          spellCheck={false}
        />
        {error("landingUrl") ? <p className={styles.fieldError}>{error("landingUrl")}</p> : null}
      </Field>
      <Field label={f.visitors.label} note={f.visitors.note}>
        <ReadOnly scores={[visitors]}>{`${range} ${f.visitors.text}`.trim()}</ReadOnly>
      </Field>
      <Field label={f.leads.label} note={f.leads.note}>
        <ReadOnly scores={[leads]}>{f.leads.text}</ReadOnly>
      </Field>
      <Field label={f.conversion.label} note={f.conversion.note}>
        <ReadOnly scores={[conversion]}>{f.conversion.text}</ReadOnly>
      </Field>
      <Field label={f.channels.label} note={f.channels.note} hint={f.channels.hint}>
        <Tags defaultValue={channels} placeholder={f.channels.placeholder} disabled={off} />
        {error("channels") ? <p className={styles.fieldError}>{error("channels")}</p> : null}
      </Field>
      <Field label={f.postUrl.label} note={f.postUrl.note} htmlFor="postUrl">
        <Input
          mono
          id="postUrl"
          name="postUrl"
          type="url"
          inputMode="url"
          maxLength={LINK_MAX}
          defaultValue={text("postUrl")}
          disabled={off}
          spellCheck={false}
        />
        {error("postUrl") ? <p className={styles.fieldError}>{error("postUrl")}</p> : null}
      </Field>
    </>
  );
}

// ── s3 ───────────────────────────────────────────────────────

function S3Fields({
  text,
  on,
  error,
  off,
}: FieldTools & { on: (name: string) => boolean }) {
  const f = S3_FIELDS;
  const initial = text("builder");
  const [builder, setBuilder] = useState(
    BUILDERS.some((item) => item.value === initial) ? initial : BUILDERS[0].value,
  );
  return (
    <>
      <Field label={f.serviceUrl.label} hint={f.serviceUrl.hint} htmlFor="serviceUrl">
        <Input
          mono
          id="serviceUrl"
          name="serviceUrl"
          type="url"
          inputMode="url"
          maxLength={LINK_MAX}
          defaultValue={text("serviceUrl")}
          disabled={off}
          spellCheck={false}
        />
        {error("serviceUrl") ? <p className={styles.fieldError}>{error("serviceUrl")}</p> : null}
      </Field>
      <Field label={f.builder.label} note={f.builder.note} hint={f.builder.hint} htmlFor="builder">
        <Select
          id="builder"
          name="builder"
          value={builder}
          onChange={(event) => setBuilder(event.target.value)}
          disabled={off}
        >
          {BUILDERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
        {/* 시안에 없다 — 「기타」의 이름 칸(머리 주석) */}
        {builder === "other" ? (
          <Input
            name="builderOther"
            maxLength={BUILDER_OTHER_MAX}
            placeholder="무엇으로 만들었는지 적어 주세요"
            defaultValue={text("builderOther")}
            disabled={off}
            aria-label="빌더 이름"
          />
        ) : null}
      </Field>
      <Field label={f.signup.label} className={styles.warnWhenOff}>
        <SwitchRow
          title={f.signup.title}
          desc={f.signup.desc}
          name="signupConnected"
          defaultChecked={on("signupConnected")}
          disabled={off}
        />
        <p className={styles.warnOff}>
          <Icon name="warn" /> {f.signup.warnOff}
        </p>
      </Field>
      <Field label={f.paymentReturn.label} note={f.paymentReturn.note}>
        <SwitchRow
          title={f.paymentReturn.title}
          desc={f.paymentReturn.desc}
          name="paymentReturn"
          defaultChecked={on("paymentReturn")}
          disabled={off}
        />
      </Field>
      <Field label={f.launch.label} note={f.launch.note}>
        <p className={`${fieldStyles.hint} ${styles.launchHint}`}>{f.launch.hint}</p>
        <div className={styles.chkl}>
          <div className={styles.grp}>{f.launch.partA}</div>
          {LAUNCH_CHECKS.map((item, i) => (
            <Check
              key={item.key}
              name={`launch${i}`}
              keyLabel={item.key}
              label={item.label}
              defaultChecked={on(`launch${i}`)}
              disabled={off}
            />
          ))}
          <div className={styles.grp}>{f.launch.partB}</div>
          <div className={styles.b0}>
            <Check
              name="aiFeature"
              keyLabel={AI_GATE.key}
              label={AI_GATE.label}
              defaultChecked={on("aiFeature")}
              disabled={off}
            />
          </div>
          <p className={styles.bHint}>{f.launch.bHint}</p>
          <div className={styles.chklB}>
            {AI_CHECKS.map((item, i) => (
              <Check
                key={item.key}
                name={`ai${i}`}
                keyLabel={item.key}
                label={item.label}
                defaultChecked={on(`ai${i}`)}
                disabled={off}
              />
            ))}
          </div>
        </div>
      </Field>
    </>
  );
}

// ── s4 ───────────────────────────────────────────────────────

function S4Fields({
  text,
  error,
  off,
  channels,
  weeks,
  visitors,
  signups,
}: FieldTools & {
  channels: string[];
  weeks: { week: number; state: "done" | "now" | "missed" }[];
  visitors: string;
  signups: string;
}) {
  const f = S4_FIELDS;
  return (
    <>
      <div className={styles.weeks}>
        {weeks.map((item) => (
          <span
            key={item.week}
            className={`${styles.wk} ${
              item.state === "done" ? styles.wkDone : item.state === "now" ? styles.wkNow : ""
            }`}
          >
            {item.state === "done"
              ? WEEK_CHIP.done(item.week)
              : item.state === "now"
                ? WEEK_CHIP.now(item.week)
                : /* 시안에 없다 — 지난 주에 안 낸 것 */ `${item.week}주차 미제출`}
          </span>
        ))}
      </div>
      <Field label={f.activity.label} htmlFor="activity">
        <Textarea
          id="activity"
          name="activity"
          maxLength={ACTIVITY_MAX}
          defaultValue={text("activity")}
          disabled={off}
        />
        {error("activity") ? <p className={styles.fieldError}>{error("activity")}</p> : null}
      </Field>
      <Field label={f.channels.label} note={f.channels.note}>
        <Tags defaultValue={channels} placeholder={f.channels.placeholder} disabled={off} />
      </Field>
      <Field label={f.improved.label} note={f.improved.note} htmlFor="improved">
        <Input
          id="improved"
          name="improved"
          maxLength={IMPROVED_MAX}
          defaultValue={text("improved")}
          disabled={off}
        />
      </Field>
      <Field label={f.weekly.label} note={f.weekly.note}>
        <ReadOnly scores={[`${f.weekly.visitors} ${visitors}`, `${f.weekly.signups} ${signups}`]}>
          {f.weekly.text}
        </ReadOnly>
      </Field>
    </>
  );
}

// ── s5 ───────────────────────────────────────────────────────

function S5Fields({
  text,
  on,
  error,
  off,
  locked,
  files,
  cards,
  paymentLabel,
}: FieldTools & {
  on: (name: string) => boolean;
  cards: { label: string; value: string }[];
  paymentLabel: string;
}) {
  const f = S5_FIELDS;
  const guide = GUIDE_CHECKS.s5;
  return (
    <>
      <Field label={f.monetized.label}>
        <SwitchRow
          title={f.monetized.title}
          desc={f.monetized.desc}
          name="monetized"
          defaultChecked={on("monetized")}
          disabled={off}
        />
      </Field>
      <Field label={f.paymentConnected.label} note={f.paymentConnected.note}>
        <SwitchRow
          title={f.paymentConnected.title}
          desc={f.paymentConnected.desc}
          name="paymentConnected"
          defaultChecked={on("paymentConnected")}
          disabled={off}
        />
        {/* 시안이 인라인으로 준 색 */}
        <p className={fieldStyles.hint} style={ACCENT}>
          {f.paymentConnected.status} {paymentLabel}
        </p>
      </Field>
      <Field label={f.final.label} note={f.final.note}>
        <div className={`${hub.snap} ${styles.snapTop}`}>
          {cards.map((card) => (
            <Card key={card.label} className={hub.snapCard}>
              <small>{card.label}</small>
              <span className="score">{card.value}</span>
            </Card>
          ))}
        </div>
      </Field>
      <Field label={f.retro.label} hint={f.retro.hint} htmlFor="retro">
        <Textarea
          id="retro"
          name="retro"
          maxLength={RETRO_MAX}
          placeholder={f.retro.placeholder}
          defaultValue={text("retro")}
          disabled={off}
        />
        {error("retro") ? <p className={styles.fieldError}>{error("retro")}</p> : null}
      </Field>
      <Field label={GUIDE_LABEL} note={guideNote(guide.chapter)}>
        <div className={styles.chkl}>
          {guide.items.map((label, i) => (
            <Check
              key={label}
              name={`guide${i}`}
              label={label}
              defaultChecked={on(`guide${i}`)}
              disabled={off}
            />
          ))}
        </div>
      </Field>
      <Field label={MEMO_FIELD.label} note={MEMO_FIELD.note} htmlFor="memo">
        <Textarea
          id="memo"
          name="memo"
          maxLength={MEMO_MAX}
          placeholder={MEMO_FIELD.placeholder.s5}
          defaultValue={text("memo")}
          disabled={off}
        />
      </Field>
      <Field label={EVIDENCE_FIELD.label} note={EVIDENCE_FIELD.note.s5}>
        <Files
          name="evidence"
          stageKey="s5"
          slot="evidence"
          defaultValue={files.evidence}
          sub={EVIDENCE_FIELD.dropSub.s5}
          locked={locked}
          error={error("evidence")}
        />
      </Field>
      <div className={styles.consents}>
        <label>
          <input
            type="checkbox"
            name="archiveConsent"
            defaultChecked={on("archiveConsent")}
            disabled={off}
          />{" "}
          <span>
            <span className={styles.req}>{f.consent.req}</span> {f.consent.label}
          </span>
        </label>
        {error("archiveConsent") ? (
          <p className={styles.fieldError}>{error("archiveConsent")}</p>
        ) : null}
      </div>
    </>
  );
}
