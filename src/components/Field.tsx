import type {
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import styles from "./Field.module.css";

/*
  시안의 입력 묶음 — `.fld`(라벨+입력+힌트), `.inp`, `.sw`(토글), `.row-sw`.

  시안은 `<div class="fld"><label>…</label><input class="inp"></div>` 구조를
  화면마다 그대로 반복한다. 그 구조를 그대로 낸다.
*/

const join = (...v: (string | undefined | false)[]) =>
  v.filter(Boolean).join(" ");

export function Field({
  label,
  /** 라벨 옆 회색 부연. 시안의 `<label>… <small>최대 120자</small></label>` */
  note,
  /** 라벨 오른쪽 끝의 글자 수. 시안 `.cnt` */
  count,
  hint,
  htmlFor,
  className,
  children,
}: {
  label?: ReactNode;
  note?: ReactNode;
  count?: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={join(styles.fld, className)}>
      {label ? (
        <label className={styles.label} htmlFor={htmlFor}>
          {label}
          {note ? <small>{note}</small> : null}
          {/* 시안 마크업은 `<label>한마디 컨셉 <span class="cnt">…`처럼
              사이에 공백 노드가 있다. 없으면 글자가 붙어 나온다 */}
          {count ? <> <span className={styles.cnt}>{count}</span></> : null}
        </label>
      ) : null}
      {children}
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { mono?: boolean };

export function Input({ mono, className, ...rest }: InputProps) {
  return (
    <input
      className={join(styles.inp, mono && styles.mono, className)}
      {...rest}
    />
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...rest }: TextareaProps) {
  return <textarea className={join(styles.inp, className)} {...rest} />;
}

/* 시안은 select에도 같은 `.inp`를 쓴다 */
export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={join(styles.inp, className)} {...rest}>
      {children}
    </select>
  );
}

/**
 * 토글. 시안 `.sw` — 체크박스를 투명하게 덮고 `<i>`를 그린다.
 * 접근성은 진짜 `<input type="checkbox">`가 지고, `<i>`는 그림만 그린다.
 */
export function Switch({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className={join(styles.sw, className)}>
      <input type="checkbox" {...rest} />
      <i />
    </span>
  );
}

/** 토글이 붙는 한 줄. 시안 `.row-sw` */
export function SwitchRow({
  title,
  desc,
  className,
  rowProps,
  ...rest
}: {
  title: ReactNode;
  desc?: ReactNode;
  className?: string;
  /** 줄 자체(`.row-sw`)에 붙일 속성. 나머지는 안쪽 체크박스로 간다 */
  rowProps?: HTMLAttributes<HTMLDivElement>;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={join(styles.rowSw, className)} {...rowProps}>
      <span>
        <b>{title}</b>
        {desc ? <small>{desc}</small> : null}
      </span>
      <Switch {...rest} />
    </div>
  );
}
