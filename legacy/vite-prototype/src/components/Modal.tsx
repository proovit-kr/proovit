import { useEffect, type ReactNode } from 'react';
import styles from './Modal.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 운영자 콘솔용 톤 */
  ops?: boolean;
  labelledBy?: string;
}

export function Modal({ open, onClose, children, ops, labelledBy }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={ops ? `${styles.dialog} ${styles['dialog--ops']}` : styles.dialog}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {children}
      </div>
    </div>
  );
}

export const ModalTitle = ({ children, id }: { children: ReactNode; id?: string }) => (
  <h3 className={styles.title} id={id}>
    {children}
  </h3>
);

export const ModalBody = ({ children }: { children: ReactNode }) => (
  <p className={styles.body}>{children}</p>
);

export const ModalActions = ({ children }: { children: ReactNode }) => (
  <div className={styles.actions}>{children}</div>
);
