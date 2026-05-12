'use client';
import { useMemo, useState } from 'react';
import { PinIcon, XIcon } from '@/components/icons/Icons';
import styles from './PinnedBar.module.css';

export default function PinnedBar({ chat, messages, onUnpin }) {
  const [idx, setIdx] = useState(0);
  const pinned = useMemo(() => {
    const ids = chat.pinned || [];
    if (ids.length === 0) return [];
    const map = new Map(messages.map((m) => [m.id, m]));
    return ids.map((id) => map.get(id)).filter(Boolean);
  }, [chat.pinned, messages]);

  if (pinned.length === 0) return null;
  const cur = pinned[Math.min(idx, pinned.length - 1)];
  if (!cur) return null;

  function next() { setIdx((i) => (i + 1) % pinned.length); }
  function jumpTo(id) {
    const el = document.querySelector(`[data-msg-id="${id}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className={styles.bar}>
      <button type="button" className={styles.body} onClick={() => { jumpTo(cur.id); next(); }}>
        <PinIcon size={14} />
        <span className={styles.label}>Mensagem fixada {pinned.length > 1 ? `(${idx + 1}/${pinned.length})` : ''}</span>
        <span className={styles.preview}>{cur.deleted ? 'Mensagem apagada' : (cur.body || labelFor(cur.type))}</span>
      </button>
      <button type="button" className={styles.unpin} onClick={() => onUnpin?.(cur)} aria-label="Desafixar"><XIcon size={14} /></button>
    </div>
  );
}

function labelFor(t) {
  if (t === 'image') return 'Foto fixada';
  if (t === 'video') return 'Vídeo fixado';
  if (t === 'audio') return 'Áudio fixado';
  if (t === 'gif') return 'GIF fixado';
  if (t === 'file') return 'Arquivo fixado';
  return 'Mensagem';
}
