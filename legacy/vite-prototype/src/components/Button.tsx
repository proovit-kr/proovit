import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './Button.module.css';

type Variant = 'primary' | 'ghost' | 'soft' | 'quiet';
type Size = 'sm' | 'md' | 'lg';

interface BaseProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  children: ReactNode;
  className?: string;
}

const classes = (
  { variant = 'primary', size = 'md', block, className }: BaseProps,
): string =>
  [styles.btn, styles[variant], styles[size], block ? styles.block : '', className ?? '']
    .filter(Boolean)
    .join(' ');

export type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant, size, block, className, children, ...rest }: ButtonProps) {
  return (
    <button className={classes({ variant, size, block, className, children })} {...rest}>
      {children}
    </button>
  );
}

export interface LinkButtonProps extends BaseProps {
  to: string;
  state?: unknown;
}

export function LinkButton({ to, state, variant, size, block, className, children }: LinkButtonProps) {
  return (
    <Link
      to={to}
      state={state as never}
      className={classes({ variant, size, block, className, children })}
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
      className={classes({ variant, size, block, className, children })}
    >
      {children}
    </a>
  );
}
