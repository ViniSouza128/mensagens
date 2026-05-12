'use client';
import styles from './ReplyPreview.module.css';

export default function ReplyPreview({ reply, onClick, dim = false }) {
  if (!reply) return null;
  const isMedia = reply.type && reply.type !== 'text';
  return (
    <button
      type="button"
      className={[styles.wrap, dim ? styles.dim : ''].join(' ')}
      onClick={onClick}
      tabIndex={onClick ? 0 : -1}
    >
      <span className={styles.bar} aria-hidden />
      <span className={styles.body}>
        <span className={styles.label}>Em resposta</span>
        <span className={styles.preview}>
          {reply.deleted ? <em className={styles.deleted}>Mensagem apagada</em>
            : isMedia ? labelFor(reply.type) : (reply.body || '—')}
        </span>
      </span>
    </button>
  );
}

function labelFor(t) {
  if (t === 'image') return '\uD83D\uDDBC Foto';
  if (t === 'video') return '\uD83C\uDFA5 Vídeo';
  if (t === 'audio') return '\uD83C\uDFA7 Áudio';
  if (t === 'gif')   return '\uD83C\uDFAC GIF';
  if (t === 'file')  return '\uD83D\uDCCE Arquivo';
  return 'Mensagem';
}
