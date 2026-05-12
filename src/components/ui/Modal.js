'use client';
import { useEffect, useRef } from 'react';
import { XIcon } from '@/components/icons/Icons';
import styles from './Modal.module.css';

export default function Modal({ open, onClose, title, children, footer, width = 460, dismissable = true }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissable) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    // foco inicial
    setTimeout(() => ref.current?.focus(), 0);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, dismissable, onClose]);
  if (!open) return null;
  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="m-title" onMouseDown={(e) => {
      if (e.target === e.currentTarget && dismissable) onClose?.();
    }}>
      <div className={styles.modal} style={{ maxWidth: width }} ref={ref} tabIndex={-1}>
        {title || dismissable ? (
          <header className={styles.header} id="m-title">
            <span className={styles.headerTitle}>{title || ''}</span>
            {dismissable ? (
              <button type="button" className={styles.headerClose} onClick={onClose} aria-label="Fechar">
                <XIcon size={18} />
              </button>
            ) : null}
          </header>
        ) : null}
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </div>
  );
}
