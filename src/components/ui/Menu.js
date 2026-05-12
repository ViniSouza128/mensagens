'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './Menu.module.css';

export default function Menu({ trigger, children, align = 'end' }) {
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState({ vertical: false, horizontal: false });
  const ref = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Flip do menu se ele estourar a viewport (vertical e horizontal)
  useEffect(() => {
    if (!open || !menuRef.current || !ref.current) return;
    const trig = ref.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const wantsUp = trig.bottom + menu.height + 12 > vh && trig.top > menu.height + 12;
    const wantsLeft = align === 'end'
      ? trig.right - menu.width < 8
      : trig.left + menu.width > vw - 8;
    setFlip({ vertical: wantsUp, horizontal: wantsLeft });
  }, [open, align]);

  return (
    <div className={styles.wrap} ref={ref}>
      <span onClick={() => setOpen((s) => !s)} role="button" aria-haspopup="menu" aria-expanded={open}>
        {trigger}
      </span>
      {open ? (
        <div
          ref={menuRef}
          className={[
            styles.menu,
            align === 'start' ? styles.start : styles.end,
            flip.vertical ? styles.up : '',
            flip.horizontal ? styles.flipH : '',
          ].join(' ')}
          role="menu"
        >
          {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({ icon, danger = false, children, onClick, ...rest }) {
  return (
    <button type="button" className={[styles.item, danger ? styles.danger : ''].join(' ')} onClick={onClick} role="menuitem" {...rest}>
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}

export function MenuDivider() { return <div className={styles.divider} />; }

// Menu container without a trigger — for portal/context-menu use cases.
export function MenuList({ children }) {
  return <div className={[styles.menu, styles.standalone].join(' ')} role="menu">{children}</div>;
}
