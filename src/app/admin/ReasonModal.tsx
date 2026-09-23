"use client";

import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/Button";
import { Textarea } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { REASON_MIN } from "@/lib/admin";

/*
  사유 입력 모달 — 시안 `#mdl-reason`(3314행).

  운영자 쓰기는 전부 사유와 함께 감사 로그에 남는다. 사유가 비어 있으면 저장
  버튼이 잠긴다(시안 스크립트 `reasonGo.disabled=!reasonTa.value.trim()`).
  잠금을 푸는 길이는 서버와 같은 `REASON_MIN`이다 — 한 글자로 풀리게 두면
  눌러도 서버가 돌려보내 운영자가 두 번 적는다.

  폼은 모달 본문에 있고 저장 버튼은 발에 있어서 `form` 속성으로 잇는다.
  무엇을 바꾸는지는 부르는 쪽이 `fields`(숨은 칸)로 넘기고, 결과는 부르는 쪽의
  `useActionState`가 받는다.
*/
type Props = {
  open: boolean;
  onClose: () => void;
  action: (formData: FormData) => void;
  fields: Record<string, string>;
  pending?: boolean;
  /** 서버가 돌려보낸 문구 */
  message?: string;
  submitLabel?: string;
  /** 사유 앞에 더 받을 칸(트랙 이름 같은 것). 시안에 없는 자리라 최소로만 쓴다 */
  extra?: ReactNode;
};

/* 열릴 때마다 새로 마운트한다 — 지난번에 적던 사유가 남지 않게 */
export function ReasonModal(props: Props) {
  return props.open ? <Body {...props} /> : null;
}

function Body({
  onClose,
  action,
  fields,
  pending,
  message,
  submitLabel = "저장",
  extra,
}: Props) {
  const id = useId();
  const [reason, setReason] = useState("");

  return (
    <Modal
      open
      onClose={onClose}
      title="사유 입력(필수)"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={id}
            disabled={pending || reason.trim().length < REASON_MIN}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={id} action={action}>
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <p>모든 운영자 쓰기 작업은 사유와 함께 감사 로그에 기록됨.</p>
        {extra}
        <Textarea
          name="reason"
          placeholder="사유를 입력해야 저장할 수 있어요"
          style={{ marginTop: "12px" }}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {message ? (
          <p role="alert" style={{ marginTop: "10px", fontSize: "13px", color: "var(--danger)" }}>
            {message}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
