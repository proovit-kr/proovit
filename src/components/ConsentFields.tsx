"use client";

import Link from "next/link";
import { useState } from "react";

import { PREREGISTER_CONSENTS, type ConsentItem } from "@/content/consent";
import { PRIVACY_POLICY } from "@/content/privacy";
import styles from "./ConsentFields.module.css";

/**
 * 사전 신청 폼의 동의 체크박스 묶음.
 *
 * 문구가 아니라 **동의를 받는 방식**이 법정 요건이라는 점이 이 컴포넌트의 전제다
 * (운영규칙서 D1~D9). 그래서 다음은 취향이 아니라 요건이고, 바꾸면 위법이 된다:
 *   - 항목마다 체크박스를 분리한다. "전체 동의" 하나로 묶지 않는다 (D2)
 *   - 선택 항목은 기본 해제로 둔다 (D4)
 *   - 선택 미동의로도 접수가 되어야 한다 (D5)
 *   - 보유·이용 기간은 본문과 시각적으로 구분한다 (D3)
 *
 * 본문을 접어두되 한 번의 클릭으로 펼 수 있게 한다. 전문을 항상 펼쳐두면
 * 히어로가 약관 화면이 되고, 링크로만 빼면 "쉽게 읽고 이해할 수 있는"(D1 ③)
 * 조건에서 멀어진다.
 */

/*
  항목 목록을 밖에서 받는다. 사전 신청(PREREGISTER_CONSENTS)과 참가 신청
  (APPLY_CONSENTS)이 같은 컴포넌트를 쓰는데, D1~D5는 문안이 아니라 **받는 방식**의
  요건이라 화면마다 복사하면 한쪽만 고쳐진다. profile.ts를 둘로 나눈 것과 같은 이유다.
*/
export type ConsentState = Record<string, boolean>;

export function emptyConsent(items: ConsentItem[]): ConsentState {
  return Object.fromEntries(items.map((c) => [c.key, false]));
}

/** 사전 신청 폼의 초기값. 항목이 고정이라 상수로 둔다. */
export const EMPTY_CONSENT: ConsentState = emptyConsent(PREREGISTER_CONSENTS);

/** 필수 동의가 모두 채워졌는가. 제출 가능 조건이다. */
export function isConsentComplete(
  state: ConsentState,
  items: ConsentItem[] = PREREGISTER_CONSENTS,
): boolean {
  return items.every((c) => !c.required || state[c.key]);
}

/** 체크박스 DOM id. 안내를 띄운 뒤 그 항목으로 포커스를 옮길 때 쓴다. */
const rowId = (key: ConsentItem["key"]) => `consent-${key}`;

/**
 * 아직 체크되지 않은 첫 필수 항목으로 포커스를 옮긴다.
 *
 * 문구로만 알리면 항목이 셋일 때 어느 것인지 찾아야 한다. 포커스까지 옮겨야
 * "무엇을 해야 하는지"가 한 번에 전달된다.
 */
export function focusFirstMissingConsent(
  state: ConsentState,
  items: ConsentItem[] = PREREGISTER_CONSENTS,
): void {
  const missing = items.find((c) => c.required && !state[c.key]);
  if (!missing) return;
  document.getElementById(rowId(missing.key))?.focus({ preventScroll: true });
}

function ConsentRow({
  item,
  checked,
  disabled,
  invalid,
  onChange,
}: {
  item: ConsentItem;
  checked: boolean;
  disabled: boolean;
  /** 제출을 시도했는데 이 필수 항목이 비어 있다 */
  invalid: boolean;
  onChange: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = rowId(item.key);
  const detailId = `${id}-detail`;
  const hasDetail = Boolean(item.body || item.table || item.notes);

  // "[필수] 개인정보 …" 에서 앞머리 태그만 떼어내 다르게 칠한다
  const match = /^\[(필수|선택)\]\s*(.*)$/.exec(item.label);
  const tag = match ? `[${match[1]}]` : null;
  const rest = match ? match[2] : item.label;

  return (
    <div>
      <div className={styles.row}>
        <input
          id={id}
          type="checkbox"
          className={styles.checkbox}
          checked={checked}
          disabled={disabled}
          /*
            `required`를 쓰지 않는다. 브라우저 기본 검증이 걸리면 우리 onSubmit이
            아예 안 불려서, 어느 항목이 왜 막혔는지 직접 안내할 기회가 사라진다.
            미동의 접수는 제출 핸들러와 서버(`/api/v1/leads`)가 각각 막는다.
          */
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label htmlFor={id} className={`${styles.label} ${invalid ? styles.labelInvalid : ""}`}>
          {tag ? (
            <span className={item.required ? styles.tagRequired : styles.tagOptional}>
              {tag}{" "}
            </span>
          ) : null}
          {rest}
        </label>
        {hasDetail ? (
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={detailId}
          >
            {open ? "접기" : "보기"}
          </button>
        ) : null}
      </div>

      {hasDetail && open ? (
        <div id={detailId} className={styles.detail}>
          {item.body ? <p>{item.body}</p> : null}

          {item.table?.map((row) => (
            <dl key={row.item}>
              <dt>수집 항목</dt>
              <dd>{row.item}</dd>
              <dt>이용 목적</dt>
              <dd>{row.purpose}</dd>
              <dt>보유 기간</dt>
              {/* D3 — 법이 지정한 "중요한 내용"이라 굵게 구분한다 */}
              <dd className={styles.important}>{row.period}</dd>
            </dl>
          ))}

          {item.notes?.map((note) => <p key={note}>{note}</p>)}
        </div>
      ) : null}
    </div>
  );
}

export default function ConsentFields({
  items = PREREGISTER_CONSENTS,
  value,
  onChange,
  disabled = false,
  showMissing = false,
  missingMessage = "필수 항목에 동의해야 사전 신청을 접수할 수 있어요.",
}: {
  /** 표시할 동의 항목. 기본값은 사전 신청 폼이다. */
  items?: ConsentItem[];
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  disabled?: boolean;
  /** 필수 항목이 비었을 때 띄우는 문장. 화면마다 "무엇을" 접수하는지가 다르다. */
  missingMessage?: string;
  /**
   * 필수 동의 없이 제출을 시도했다. 비어 있는 필수 항목을 짚어준다.
   *
   * 처음부터 빨갛게 칠하지 않는 이유는, 아직 아무것도 안 한 사람에게 잘못을
   * 지적하는 화면이 되기 때문이다. 제출을 눌러본 뒤에만 켠다.
   */
  showMissing?: boolean;
}) {
  return (
    <div className={styles.root}>
      {items.map((item) => (
        <ConsentRow
          key={item.key}
          item={item}
          checked={value[item.key]}
          disabled={disabled}
          invalid={showMissing && item.required && !value[item.key]}
          onChange={(next) => onChange({ ...value, [item.key]: next })}
        />
      ))}

      {showMissing && !isConsentComplete(value, items) ? (
        <p className={styles.missing} role="alert">
          {missingMessage}
        </p>
      ) : null}

      {/*
        문안 A의 마지막 문장("자세한 내용은 [개인정보처리방침]에서 확인할 수
        있어요")이 전제하는 링크.

        방침 본문이 확정되기 전에는 렌더하지 않는다 — 빈칸이 남은 방침은 게재
        안 한 것보다 나쁘다(content/privacy.ts 주석). 동의 자체는 고지 4요소
        (목적·항목·기간·거부권)를 이 화면에서 전부 보여주므로 링크 없이도 유효하다.
      */}
      {PRIVACY_POLICY ? (
        <p className={styles.policyLink}>
          자세한 내용은{" "}
          {/* 새 탭으로 연다 — 같은 탭에서 이동하면 채우던 폼이 날아간다 */}
          <Link href="/privacy" target="_blank" rel="noopener">
            개인정보처리방침
          </Link>
          에서 확인할 수 있어요.
        </p>
      ) : null}
    </div>
  );
}
