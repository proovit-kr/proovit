"use client";

import Link from "next/link";
import { useId } from "react";

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
 * 고지 4요소는 이 자리에 펼치지 않고 개인정보처리방침으로 보낸다. 시안의
 * 「보기」가 두 곳 모두 `<a class="see" href="#privacy">`이고, 운영규칙서
 * 게시 전 확인 3번이 「별도 연결화면 또는 팝업」을 명시로 허용한다.
 *
 * ⚠️ 그래서 **개인정보처리방침이 고지의 정본**이다. 거기서 항목(제2조)·
 * 목적(제3조)·기간(제9조)·거부권(제13조) 중 하나라도 빠지면 이 화면의
 * 동의가 요건을 잃는다.
 */

/*
  항목 목록을 밖에서 받는다. 사전 신청(PREREGISTER_CONSENTS)과 참가 신청
  (APPLY_CONSENTS)이 같은 컴포넌트를 쓰는데, D1~D5는 문안이 아니라 **받는 방식**의
  요건이라 화면마다 복사하면 한쪽만 고쳐진다.
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
  idPrefix,
  checked,
  disabled,
  invalid,
  onChange,
}: {
  item: ConsentItem;
  idPrefix: string;
  checked: boolean;
  disabled: boolean;
  /** 제출을 시도했는데 이 필수 항목이 비어 있다 */
  invalid: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = `${idPrefix}${rowId(item.key)}`;

  // "[필수] 개인정보 …" 에서 앞머리 태그만 떼어내 다르게 칠한다
  const match = /^\[(필수|선택)\]\s*(.*)$/.exec(item.label);
  const tag = match ? `[${match[1]}]` : null;
  const rest = match ? match[2] : item.label;

  return (
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
      <label
        htmlFor={id}
        className={`${styles.label} ${invalid ? styles.labelInvalid : ""}`}
      >
        {/*
          ⚠️ 공백을 태그 **밖**에 둔다. 안에 넣으면 11px 태그 크기로 그려져
          뒤 글자가 1px쯤 당겨진다. 시안은 `<span class="req">[필수]</span> 개인…`
          처럼 태그와 본문 사이에 공백 노드가 있다.
        */}
        {tag ? (
          <>
            <span
              className={
                item.required ? styles.tagRequired : styles.tagOptional
              }
            >
              {tag}
            </span>{" "}
          </>
        ) : null}
        {rest}
        {/*
          시안은 「보기」를 라벨 글자 바로 뒤에 공백 하나 두고 붙인다. 형제로
          빼면 `.row`의 flex gap이 끼어서 간격이 벌어진다 — 그래서 라벨
          **안**에 둔다. 대신 라벨 안의 클릭이 체크박스 토글로 새므로 전파를
          끊는다. 링크라 preventDefault는 못 쓴다(이동 자체가 막힌다).
        */}
        {item.policyHref ? (
          <>
            {" "}
            <Link
              href={item.policyHref}
              className={styles.see}
              onClick={(e) => e.stopPropagation()}
            >
              보기
            </Link>
          </>
        ) : null}
      </label>
    </div>
  );
}

export default function ConsentFields({
  items = PREREGISTER_CONSENTS,
  idPrefix = "",
  value,
  onChange,
  disabled = false,
  showMissing = false,
  missingMessage = "필수 항목에 동의해야 사전 신청을 접수할 수 있어요.",
  selectAll = false,
  selectAllLabel = "모두 선택",
  className,
}: {
  /** 표시할 동의 항목. 기본값은 사전 신청 폼이다. */
  items?: ConsentItem[];
  /** 랜딩 폼 위에 가입 모달이 겹칠 때 label이 다른 체크박스를 가리키지 않게 한다. */
  idPrefix?: string;
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
  /**
   * 「모두 선택」 줄을 낸다. 시안은 랜딩 폼에만 둔다 —
   * 인증 화면은 항목이 둘뿐이라 모아 줄 것이 없다.
   */
  selectAll?: boolean;
  /**
   * 「모두 선택」 줄의 글자.
   *
   * ⚠️ **시안이 화면마다 다르게 적었다.** ver4 1547행(랜딩 사전신청 폼)은
   * 「모두 선택」, 1735행(계정 동의 모달)은 「모두 동의」다. 동의를 받는
   * 자리라 말이 달라야 하는 것으로 읽힌다.
   */
  selectAllLabel?: string;
  /** 쓰는 화면이 여백만 덮는 자리. 시안이 랜딩에서 인라인으로 하는 일이다 */
  className?: string;
}) {
  /*
    「모두 선택」. ver3의 v3.0 피드백 패스가 넣었다.

    ⚠️ **랜딩에만 있다.** 시안은 랜딩 폼에만 `data-all`을 걸고 인증 화면
    (`.consents.only-signup`)에는 넣지 않는다. 항목이 둘뿐이라 모아 줄 것이
    없어서로 읽힌다. 그래서 부르는 쪽이 켜는 값으로 둔다 — 기본은 끔이다.

    ⚠️ **개별 체크박스를 대신하지 않는다.** 항목마다 체크박스를 두고 선택은
    기본 해제로 둔다는 요건(D2·D4)은 그대로다 — 이 줄은 항목이 아니라 조작이고,
    아래 셋은 여전히 각자 켜고 끌 수 있다. 그래서 상태를 따로 들지 않고
    「전부 켜져 있는가」로 계산한다. 하나라도 끄면 저절로 풀린다.

    ⚠️ 이 줄은 **선택 항목(마케팅 수신)까지 함께 켠다.** 시안이 그렇게 그렸고
    (`items` 전체를 도는 스크립트) 그대로 따랐다. 다만 선택 동의를 일괄 동의에
    묶는 것은 규제기관이 눈여겨보는 자리이므로, 문제가 되면 여기서 선택 항목만
    빼면 된다.
  */
  const allKeys = items.map((c) => c.key);
  const allChecked = allKeys.length > 0 && allKeys.every((k) => value[k]);
  const toggleAll = (next: boolean) =>
    onChange(Object.fromEntries(allKeys.map((k) => [k, next])));
  const allId = `${useId()}-all`;

  return (
    <div className={[styles.root, className].filter(Boolean).join(" ")}>
      {selectAll ? (
        <div className={`${styles.row} ${styles.all}`}>
          <input
            id={allId}
            type="checkbox"
            className={styles.checkbox}
            checked={allChecked}
            disabled={disabled}
            onChange={(e) => toggleAll(e.target.checked)}
          />
          <label htmlFor={allId} className={styles.label}>
            {selectAllLabel}
          </label>
        </div>
      ) : null}

      {items.map((item) => (
        <ConsentRow
          key={item.key}
          item={item}
          idPrefix={idPrefix}
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
        ⚠️ 문안 A의 마지막 문장("자세한 내용은 [개인정보처리방침]에서 확인할 수
        있어요")이 전제하는 링크가 빠져 있다. `/privacy`가 시안 v2.1 화면
        레지스트리에 없어 라우트를 지웠기 때문이다.

        동의 자체는 고지 4요소(목적·항목·기간·거부권)를 이 화면에서 전부
        보여주므로 링크 없이도 유효하다. 시안에 방침 화면이 추가되면 되살린다.
      */}
    </div>
  );
}
