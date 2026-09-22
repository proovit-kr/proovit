"use client";

import { useState, type ReactNode } from "react";

import { Field, Input, Textarea } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { READ_ONLY_LOCK } from "@/content/submission";

import styles from "./submit.module.css";

/*
  제출 폼의 부품 — 시안 `#scr-submit`에서 되풀이되는 조각.
  글자 수 칸(`.cnt`), 세그(`.seg`), 태그 입력(`.tags`), 읽기 전용 상자(`.ro`),
  체크리스트(`.chkl`). 폼(StageForm.tsx)이 판마다 이것들을 늘어놓는다.
*/

/** 라벨 앞 번호 — 시안 `<span class="no">①</span>` */
export function No({ children }: { children: string }) {
  return <span className={styles.no}>{children}</span>;
}

/**
 * 글자 수를 세는 칸 — 시안 `<label>… <span class="cnt">31 / 200</span></label>`.
 * 세는 것은 화면의 편의고 상한은 서버가 지킨다(`maxLength` + 스키마).
 */
export function Counted({
  label,
  hint,
  name,
  max,
  defaultValue,
  placeholder,
  disabled,
  error,
  multiline,
  mono,
}: {
  label: ReactNode;
  hint?: ReactNode;
  name: string;
  max: number;
  defaultValue: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  multiline?: boolean;
  mono?: boolean;
}) {
  const [length, setLength] = useState(defaultValue.length);
  const shared = {
    id: name,
    name,
    maxLength: max,
    defaultValue,
    placeholder,
    disabled,
    onChange: (event: { target: { value: string } }) =>
      setLength(event.target.value.length),
  };
  return (
    <Field label={label} count={`${length} / ${max}`} hint={hint} htmlFor={name}>
      {multiline ? <Textarea {...shared} /> : <Input mono={mono} {...shared} />}
      {error ? <p className={styles.fieldError}>{error}</p> : null}
    </Field>
  );
}

/**
 * 세그 — 시안 `.seg`. 두세 개 중 하나를 고르고, 값은 hidden으로 실어 보낸다.
 * 시안은 첫 칸이 기본으로 켜져 있다.
 */
export function Seg({
  name,
  options,
  defaultValue,
  disabled,
  className,
}: {
  name: string;
  options: readonly { value: string; label: string }[];
  defaultValue: string;
  disabled?: boolean;
  className?: string;
}) {
  const [picked, setPicked] = useState(defaultValue);
  return (
    <div className={[styles.seg, className].filter(Boolean).join(" ")}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={picked === option.value ? styles.segOn : undefined}
          onClick={() => setPicked(option.value)}
          disabled={disabled}
          aria-pressed={picked === option.value}
        >
          {option.label}
        </button>
      ))}
      <input type="hidden" name={name} value={picked} />
    </div>
  );
}

/**
 * 태그 입력 — 시안 `.tags`. Enter로 칩을 쌓고 ×로 뺀다. 칩 하나가 hidden
 * `channels` 하나라 서버는 `getAll("channels")`로 받는다.
 */
export function Tags({
  defaultValue,
  placeholder,
  disabled,
}: {
  defaultValue: string[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [tags, setTags] = useState(defaultValue);
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value || tags.includes(value)) {
      setDraft("");
      return;
    }
    setTags([...tags, value]);
    setDraft("");
  };

  return (
    <div className={styles.tags}>
      {tags.map((tag) => (
        <span key={tag} className={styles.tag}>
          {tag}{" "}
          {/* 잠긴 판에도 ×는 그린다(시안 s2) — 누르지만 못한다 */}
          <button
            type="button"
            className={styles.tagX}
            onClick={() => setTags(tags.filter((item) => item !== tag))}
            disabled={disabled}
            aria-label={`${tag} 빼기`}
          >
            ×
          </button>
          <input type="hidden" name="channels" value={tag} />
        </span>
      ))}
      <input
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          /* 한글 조합 중의 Enter는 글자를 확정하는 키다 — 칩으로 넘기지 않는다 */
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            add();
          }
        }}
        onBlur={add}
        aria-label={placeholder}
      />
    </div>
  );
}

/**
 * 읽기 전용 상자 — 시안 `.ro`. **입력으로 바꾸지 않는다.** 시안이 자물쇠로
 * 그린 자리이고, 랜딩이 「참가자가 숫자를 입력하지 않는다」고 약속한 자리다.
 * 숫자를 받는 순간 그 약속이 깨지고 심사의 근거도 자기신고가 된다.
 */
export function ReadOnly({
  scores,
  children,
}: {
  scores: string[];
  children: ReactNode;
}) {
  return (
    <div className={styles.ro}>
      {scores.map((score, i) => (
        <span key={i} className="score">
          {score}
        </span>
      ))}
      {children}
      <span className={styles.lk}>
        <Icon name="lock" /> {READ_ONLY_LOCK}
      </span>
    </div>
  );
}

/** 체크 한 줄 — 시안 `.chkl label`. 번호(A1)는 있을 때만 */
export function Check({
  name,
  label,
  keyLabel,
  defaultChecked,
  checked,
  onChange,
  disabled,
}: {
  name: string;
  label: string;
  keyLabel?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label>
      <input
        type="checkbox"
        name={name}
        defaultChecked={onChange ? undefined : defaultChecked}
        checked={onChange ? checked : undefined}
        onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
        disabled={disabled}
      />{" "}
      <span>
        {keyLabel ? <span className={styles.chkKey}>{keyLabel}</span> : null}
        {label}
      </span>
    </label>
  );
}

/** 가이드 완료 체크 셋 — 순서가 곧 뜻이라 인덱스를 이름에 박는다 */
export function GuideChecks({
  items,
  on,
  disabled,
}: {
  items: readonly string[];
  on: Record<string, boolean>;
  disabled?: boolean;
}) {
  return (
    <div className={styles.chkl}>
      {items.map((label, i) => (
        <Check
          key={label}
          name={`guide${i}`}
          label={label}
          defaultChecked={on[`guide${i}`] ?? false}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
