'use client';
import { useEffect } from 'react';
import styles from './Drawer.module.css';

export default function Drawer({ open, onClose, side = 'right', width = 380, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <aside
        className={[styles.drawer, side === 'right' ? styles.right : styles.left].join(' ')}
        style={{ '--drawer-w': `${width}px` }}
        role="dialog"
        aria-modal="true"
      >
        {title ? <header className={styles.header}>{title}</header> : null}
        <div className={styles.body}>{children}</div>
      </aside>
    </div>
  );
}
