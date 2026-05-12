'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './ReactionPicker.module.css';

const QUICK = ['\uD83D\uDC4D', '\u2764\uFE0F', '\uD83D\uDE02', '\uD83D\uDE2E', '\uD83D\uDE22', '\uD83D\uDE4F'];
const MORE  = ['\uD83D\uDC4F', '\uD83D\uDD25', '\uD83C\uDF89', '\u2705', '\u274C', '\uD83D\uDC40', '\uD83E\uDD14', '\uD83E\uDD23', '\uD83D\uDE0D', '\uD83D\uDE0E', '\uD83E\uDD7A', '\uD83D\uDCAF'];

export default function ReactionPicker({ onPick, onClose }) {
  const [more, setMore] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) onClose?.(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className={styles.picker} ref={ref} role="menu" aria-label="Escolher reação">
      <div className={styles.row}>
        {QUICK.map((e) => (
          <button key={e} type="button" className={styles.btn} onClick={() => onPick?.(e)}>{e}</button>
        ))}
        <button type="button" className={styles.btn} onClick={() => setMore((s) => !s)} aria-label="Mais">+</button>
      </div>
      {more ? (
        <div className={styles.row}>
          {MORE.map((e) => (
            <button key={e} type="button" className={styles.btn} onClick={() => onPick?.(e)}>{e}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
