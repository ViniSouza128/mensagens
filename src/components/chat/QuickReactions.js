'use client';
import { MoreIcon } from '@/components/icons/Icons';
import styles from './QuickReactions.module.css';

const QUICK = ['❤️', '😂', '😮', '😢', '🔥', '👍'];

/**
 * Popover de reações rápidas — surge no hover da bubble.
 * Props:
 *   onPick: (emoji) => void
 *   onMore: () => void  (abre picker completo)
 *   mine: bool — alinha à direita se for minha mensagem
 */
export default function QuickReactions({ onPick, onMore, mine = false }) {
  return (
    <div className={[styles.popover, mine ? styles.right : ''].join(' ')} data-quick-reactions aria-hidden>
      {QUICK.map(e => (
        <button
          key={e}
          type="button"
          className={styles.btn}
          onClick={(ev) => { ev.stopPropagation(); onPick?.(e); }}
        >
          {e}
        </button>
      ))}
      <button
        type="button"
        className={[styles.btn, styles.more].join(' ')}
        onClick={(ev) => { ev.stopPropagation(); onMore?.(); }}
        aria-label="Mais reações"
      >
        <MoreIcon size={14} />
      </button>
    </div>
  );
}
