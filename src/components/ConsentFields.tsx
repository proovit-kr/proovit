"use client";

import { useState } from "react";

import { PREREGISTER_CONSENTS, type ConsentItem } from "@/content/consent";
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

export interface ConsentState {
  privacy: boolean;
  age: boolean;
  marketing: boolean;
}

export const EMPTY_CONSENT: ConsentState = {
  privacy: false,
  age: false,
  marketing: false,
};

/** 필수 동의가 모두 채워졌는가. 제출 버튼 활성 조건이다. */
export function isConsentComplete(state: ConsentState): boolean {
  return PREREGISTER_CONSENTS.every((c) => !c.required || state[c.key]);
}

function ConsentRow({
  item,
  checked,
  disabled,
  onChange,
}: {
  item: ConsentItem;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = `consent-${item.key}`;
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
          required={item.required}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label htmlFor={id} className={styles.label}>
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
  value,
  onChange,
  disabled = false,
}: {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.root}>
      {PREREGISTER_CONSENTS.map((item) => (
        <ConsentRow
          key={item.key}
          item={item}
          checked={value[item.key]}
          disabled={disabled}
          onChange={(next) => onChange({ ...value, [item.key]: next })}
        />
      ))}

      {/*
        TODO: 개인정보처리방침 링크 자리.

        문안 A는 "자세한 내용은 [개인정보처리방침]에서 확인할 수 있어요"로 끝나고,
        시행령 제31조 제2항은 첫 화면 하단 지속 게재를 요구한다. 그런데 팀장님
        방침 문서에 상호·연락처·시행일과 제6·7조(수탁자·국외이전) 표가 비어 있고,
        같은 문서의 확인목록 1번이 "표가 비면 제28조의8의 동의 갈음 요건이 깨져
        방침이 무력화됨"이라고 적고 있다. 반쯤 채운 방침을 올리면 안 올린 것보다
        나쁘므로 값이 확정될 때까지 링크를 걸지 않는다.

        동의 자체는 고지 4요소(목적·항목·기간·거부권)를 이 화면에서 전부
        보여주므로 링크 없이도 유효하다.
      */}
    </div>
  );
}
