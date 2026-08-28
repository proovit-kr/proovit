"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

import styles from "./Modal.module.css";

/*
  확인 모달 — 시안 `.mdl-ov` / `.mdl`.

  시안에서 이걸 쓰는 자리는 전부 **되돌리기 어려운 것**이다:
  팀원 강퇴, 팀장 이양, 탈퇴, 게이트 배치 실행, 공지 발송, 순위 확정.
  그래서 확인 버튼을 오른쪽 끝에 두고 취소를 그 왼쪽에 둔다.

  시안은 뷰어라 `.mdl-ov.on`을 토글하지만, 우리는 열렸을 때만 렌더한다 —
  닫힌 모달의 내용이 DOM에 남아 있으면 읽는 도구가 그걸 읽는다.
*/
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  /** 버튼 줄. 취소가 왼쪽, 실행이 오른쪽 */
  footer: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  /* Esc로 닫는다. 되돌리기 어려운 작업일수록 빠져나갈 길이 분명해야 한다 */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* 열리면 모달로 초점을 옮긴다. 안 그러면 뒤쪽 버튼에 초점이 남는다 */
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      /* 바깥을 눌러도 닫힌다. 다만 안쪽 클릭이 새어 나가지 않게 대상을 본다 */
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={styles.mdl}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h3 id={titleId}>{title}</h3>
        {children}
        <div className={styles.foot}>{footer}</div>
      </div>
    </div>
  );
}
