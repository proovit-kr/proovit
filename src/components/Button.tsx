import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./Button.module.css";

/*
  프로토타입의 Button을 Next로 옮긴 것.
  변경점은 react-router `<Link to>` → `next/link` `<Link href>` 하나다.
  스타일과 variant는 그대로 둔다.
*/

type Variant = "primary" | "ghost" | "soft" | "quiet";
type Size = "sm" | "md" | "lg";

interface BaseProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  children: ReactNode;
  className?: string;
}

const classes = ({
  variant = "primary",
  size = "md",
  block,
  className,
}: Omit<BaseProps, "children">): string =>
  [
    styles.btn,
    styles[variant],
    styles[size],
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
}

export function LinkButton({
  href,
  variant,
  size,
  block,
  className,
  children,
}: LinkButtonProps) {
  return (
    <Link href={href} className={classes({ variant, size, block, className })}>
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
