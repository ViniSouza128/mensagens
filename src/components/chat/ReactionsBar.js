'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './ReactionsBar.module.css';

export default function ReactionsBar({ reactions, me, onReact }) {
  const [openEmoji, setOpenEmoji] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!openEmoji) return;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpenEmoji(null); };
    const onKey = (e) => { if (e.key === 'Escape') setOpenEmoji(null); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [openEmoji]);

  if (!reactions || reactions.length === 0) return null;

  // group by emoji
  const map = new Map();
  for (const r of reactions) {
    const k = r.emoji;
    if (!map.has(k)) map.set(k, { emoji: k, count: 0, mine: false, users: [] });
    const e = map.get(k);
    e.count += 1;
    if (r.user_id === me?.id) e.mine = true;
    e.users.push({ id: r.user_id, name: r.user_name || (r.user_id === me?.id ? 'Você' : '·') });
  }
  const items = [...map.values()];

  function toggleDetails(emoji) {
    setOpenEmoji((cur) => cur === emoji ? null : emoji);
  }

  return (
    <div className={styles.wrap} ref={ref}>
      {items.map((it) => (
        <div key={it.emoji} className={styles.chipWrap}>
          <button
            type="button"
            className={[styles.chip, it.mine ? styles.mine : ''].join(' ')}
            onClick={() => onReact?.(it.emoji)}
            onContextMenu={(e) => { e.preventDefault(); toggleDetails(it.emoji); }}
            onAuxClick={(e) => { if (e.button === 1) toggleDetails(it.emoji); }}
            aria-label={`Reação ${it.emoji} (${it.count}). Botão direito para ver quem reagiu.`}
          >
            <span className={styles.emoji}>{it.emoji}</span>
            <span className={styles.count}>{it.count}</span>
          </button>
          <button
            type="button"
            className={styles.dotBtn}
            onClick={() => toggleDetails(it.emoji)}
            aria-label="Ver quem reagiu"
          >…</button>
          {openEmoji === it.emoji ? (
            <div className={styles.popover} role="dialog" aria-label="Quem reagiu">
              <div className={styles.popHead}>
                <span className={styles.popEmoji}>{it.emoji}</span>
                <span>{it.count} {it.count === 1 ? 'pessoa' : 'pessoas'}</span>
              </div>
              <ul className={styles.popList}>
                {it.users.map((u, idx) => (
                  <li key={`${u.id}-${idx}`} className={styles.popItem}>
                    <span className={styles.popName}>{u.name}</span>
                    {u.id === me?.id ? <button className={styles.popRemove} onClick={() => { setOpenEmoji(null); onReact?.(it.emoji); }}>Remover</button> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
