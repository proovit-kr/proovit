import Link from "next/link";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode, Ref } from "react";

import styles from "./Button.module.css";

/*
  버튼 — 시안 `.btn`의 변형을 그대로 쓴다.
  primary / outline / ghost / danger / kakao / google 여섯이 시안 ver3의 전부이고,
  violet / gray 둘은 「헤더 상태별 시안 v1.0」이 더한 것이다 — 운영 콘솔(P11)과
  탈락팀의 내 대시보드(P10)가 쓴다.
*/

type SpecVariant =
  | "primary" | "outline" | "ghost" | "danger" | "kakao" | "google"
  | "violet" | "gray";

/*
  ⚠️ 임시 별칭 — 시안 이식이 끝나면 지운다.

  기존 호출부 26개 파일이 옛 이름을 쓴다. 지금 한 번에 끊으면 아직 옮기지 않은
  화면을 손대야 해서, 시안의 가장 가까운 변형으로 이어 둔다. 화면을 옮길 때
  그 파일의 호출부를 시안 이름으로 고치고, 마지막 하나가 없어지면 이 표도
  같이 없앤다.

    soft   라임 틴트 + 라임 테두리   → outline (같은 역할)
    quiet  테두리 없는 낮은 대비      → ghost   (시안 `.btn-ghost`가 이것이다)

  ⚠️ 옛 `ghost`(주 CTA 옆의 보조 버튼)는 별칭으로 두지 않고 호출부 두 곳을
  `outline`으로 고쳤다. 시안에도 `ghost`라는 변형이 있는데 뜻이 정반대라
  (테두리 없는 낮은 대비) 별칭이 진짜 이름을 가로채기 때문이다.

  진행 상황: `grep -rE 'variant="(soft|quiet)"' src` 가 비면 삭제 가능.
*/
const LEGACY: Record<string, SpecVariant> = {
  soft: "outline",
  quiet: "ghost",
};

type Variant = SpecVariant | "soft" | "quiet";

/*
  ⚠️ 크기도 시안에는 없다 — 쓰는 자리마다 인라인으로 붙인다.
  Button.module.css의 sm·lg는 시안이 실제로 쓰는 두 조합을 옮겨 둔 것이고,
  md는 `.btn` 기본값이라 클래스가 없다.
*/
type Size = "sm" | "md" | "lg";

interface BaseProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  children: ReactNode;
  className?: string;
  /*
    시안은 크기 변형을 두지 않고 쓰는 자리마다 인라인으로 padding·font-size를
    준다(예: 파이널 CTA `padding:14px 30px;font-size:15px`). 그 값을 그대로
    옮길 수 있어야 해서 열어 둔다.
  */
  style?: CSSProperties;
}

const classes = ({
  variant = "primary",
  size = "md",
  block,
  className,
}: Omit<BaseProps, "children">): string =>
  [
    styles.btn,
    styles[LEGACY[variant] ?? variant],
    size === "md" ? "" : styles[size],
    block ? styles.block : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

export type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant,
  size,
  block,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button className={classes({ variant, size, block, className })} {...rest}>
      {children}
    </button>
  );
}

export interface LinkButtonProps extends BaseProps {
  href: string;
  /*
    ⚠️ ref를 받아 넘긴다. 랜딩의 `Reveal`이 자식에 ref를 붙여 화면 진입을
    관찰하는데, 여기서 버리면 관찰이 안 붙어 버튼이 opacity 0으로 영영
    남는다(모집 중 파이널 「참가 신청하기」가 그랬다).
  */
  ref?: Ref<HTMLAnchorElement>;
}

export function LinkButton({
  href,
  variant,
  size,
  block,
  className,
  style,
  children,
  ref,
}: LinkButtonProps) {
  return (
    <Link
      ref={ref}
      href={href}
      className={classes({ variant, size, block, className })}
      style={style}
    >
      {children}
    </Link>
  );
}

export interface AnchorButtonProps extends BaseProps {
  href: string;
  target?: string;
  rel?: string;
}

export function AnchorButton({
  href,
  target,
  rel,
  variant,
  size,
  block,
  className,
  children,
}: AnchorButtonProps) {
  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={classes({ variant, size, block, className })}
    >
      {children}
    </a>
  );
}
