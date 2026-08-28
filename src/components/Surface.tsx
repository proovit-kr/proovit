import type { ElementType, HTMLAttributes, ReactNode } from "react";

import styles from "./Surface.module.css";

/*
  시안의 표면 세 가지 — `.card`, `.chip`, `.empty`.

  마크업이 아니라 스타일이 본체라서 `as`로 태그를 갈아 끼울 수 있게 뒀다.
  시안이 같은 `.card`를 `<div>`로도 `<span>`으로도 쓴다(예: 시즌 관리의
  `<span class="keybox">`). 구조를 시안에 맞추려면 태그를 고를 수 있어야 한다.
*/

type DivProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  children: ReactNode;
};

const join = (...v: (string | undefined | false)[]) =>
  v.filter(Boolean).join(" ");

export function Card({ as: Tag = "div", className, children, ...rest }: DivProps) {
  return (
    <Tag className={join(styles.card, className)} {...rest}>
      {children}
    </Tag>
  );
}

export function Chip({ as: Tag = "span", className, children, ...rest }: DivProps) {
  return (
    <Tag className={join(styles.chip, className)} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * 빈 상태. 시안 `.empty`는 큰 줄 하나와 설명 한 줄이다.
 * 큰 줄은 모노스페이스 800 — 「숫자가 들어올 자리」임을 서체로 알린다.
 */
export function Empty({
  headline,
  children,
  className,
}: {
  headline?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={join(styles.empty, className)}>
      {headline ? <div className={styles.emptyBig}>{headline}</div> : null}
      {children}
    </div>
  );
}
