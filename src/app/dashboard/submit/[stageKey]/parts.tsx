"use client";

import { useRef, useState, type ReactNode } from "react";

import { Field, Input, Textarea } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { EVIDENCE_FIELD, EVIDENCE_MESSAGE, READ_ONLY_LOCK } from "@/content/submission";
import type { StageKey } from "@/generated/prisma/enums";
import {
  EVIDENCE_ACCEPT,
  EVIDENCE_COUNT_MAX,
  EVIDENCE_MAX_BYTES,
  evidenceHref,
  evidenceName,
  type EvidenceSlot,
} from "@/lib/evidence";

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
  value,
  onChange,
  disabled,
  className,
}: {
  /** 있으면 고른 값을 hidden으로 실어 보낸다. 없으면 화면만 가른다(문제 정의 상세) */
  name?: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [own, setOwn] = useState(defaultValue ?? options[0].value);
  const picked = value ?? own;
  const setPicked = (next: string) => {
    setOwn(next);
    onChange?.(next);
  };
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
      {name ? <input type="hidden" name={name} value={picked} /> : null}
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

type Uploaded = { key: string; name: string };

/**
 * 파일 칸 — 시안 `.drop`(끌어다 놓거나 클릭)과 `.file`(올린 파일 칩). 고르면 곧바로
 * `/api/evidence`에 올리고 키를 hidden으로 쌓는다. 칩 하나가 hidden 하나라 서버는
 * `getAll(name)`으로 받는다(태그와 같다). ×는 목록에서만 뺀다 — 저장소의 파일은
 * 폼이 저장될 때 목록과 맞춰진다(submission-store.ts).
 *
 * 잠긴 판은 시안대로 칩만 그린다(s2). 열린 판은 드롭 칸을 그린다.
 */
export function Files({
  name,
  stageKey,
  slot,
  defaultValue,
  sub,
  locked,
  error,
}: {
  name: string;
  stageKey: StageKey;
  slot: EvidenceSlot;
  defaultValue: string[];
  /** `.drop`의 둘째 줄 */
  sub?: string;
  locked: boolean;
  error?: string;
}) {
  const [files, setFiles] = useState<Uploaded[]>(() =>
    defaultValue.map((key) => ({ key, name: evidenceName(key) })),
  );
  const [pending, setPending] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (list: FileList | File[]) => {
    const picked = [...list];
    if (picked.length === 0) return;
    if (files.length + pending.length + picked.length > EVIDENCE_COUNT_MAX) {
      setMessage(EVIDENCE_MESSAGE.tooMany);
      return;
    }
    setMessage(null);
    for (const file of picked) {
      if (file.size > EVIDENCE_MAX_BYTES) {
        setMessage(EVIDENCE_MESSAGE.tooBig);
        continue;
      }
      setPending((p) => [...p, file.name]);
      try {
        const body = new FormData();
        body.set("file", file);
        body.set("stageKey", stageKey);
        body.set("slot", slot);
        const res = await fetch("/api/evidence", { method: "POST", body });
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: Uploaded }
          | { ok: false; error: { message: string } }
          | null;
        if (json?.ok) setFiles((f) => [...f, json.data]);
        else setMessage(json && !json.ok ? json.error.message : EVIDENCE_MESSAGE.failed);
      } catch {
        setMessage(EVIDENCE_MESSAGE.failed);
      } finally {
        setPending((p) => {
          const at = p.indexOf(file.name);
          return at < 0 ? p : [...p.slice(0, at), ...p.slice(at + 1)];
        });
      }
    }
  };

  return (
    <>
      {!locked ? (
        <div
          className={over ? `${styles.drop} ${styles.dropOn}` : styles.drop}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            void upload(event.dataTransfer.files);
          }}
        >
          <b>{EVIDENCE_FIELD.drop}</b>
          {sub ? (
            <>
              <br />
              {sub}
            </>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            accept={EVIDENCE_ACCEPT}
            multiple
            onChange={(event) => {
              if (event.target.files) void upload(event.target.files);
              event.target.value = "";
            }}
            aria-label={EVIDENCE_FIELD.drop}
          />
        </div>
      ) : null}
      {files.map((file) => (
        <span key={file.key} className={styles.file}>
          {/* 시안의 📎는 인라인 SVG다(⚠️와 같은 처리) */}
          <Icon name="clip" />{" "}
          <a href={evidenceHref(file.key)} target="_blank" rel="noreferrer">
            {file.name}
          </a>{" "}
          {/* 잠긴 판에도 ×는 그린다(시안 s2) — 누르지만 못한다 */}
          <button
            type="button"
            className={styles.fileX}
            disabled={locked}
            onClick={() => setFiles(files.filter((item) => item.key !== file.key))}
            aria-label={`${file.name} ${EVIDENCE_MESSAGE.remove}`}
          >
            ×
          </button>
          <input type="hidden" name={name} value={file.key} />
        </span>
      ))}
      {locked && files.length === 0 ? (
        <p className={styles.fileNone}>{EVIDENCE_MESSAGE.none}</p>
      ) : null}
      {pending.map((label, i) => (
        <span key={`${label}${i}`} className={`${styles.file} ${styles.filePending}`}>
          <Icon name="clip" /> {label} <i>{EVIDENCE_MESSAGE.uploading}</i>
        </span>
      ))}
      {message || error ? <p className={styles.fieldError}>{message ?? error}</p> : null}
    </>
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
