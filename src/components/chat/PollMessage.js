'use client';
import { useState } from 'react';
import { PollIcon } from '@/components/icons/Icons';
import styles from './PollMessage.module.css';

/**
 * Poll bubble — pergunta + opções com fill bar percentual.
 * Props:
 *   question: string
 *   options: [{ label, votes, voted? }]
 *   total: número total de votos
 *   multiple: bool — múltipla escolha
 *   onVote: (index) => void
 *   mine: bool
 */
export default function PollMessage({ question, options = [], total = 0, multiple = false, onVote, mine = false }) {
  const [voted, setVoted] = useState(options.map(o => !!o.voted));
  const [counts, setCounts] = useState(options.map(o => o.votes || 0));
  const totalNow = counts.reduce((a, b) => a + b, 0);

  function vote(i) {
    if (voted[i] && !multiple) return;
    if (multiple) {
      setVoted(v => { const n = [...v]; n[i] = !n[i]; return n; });
      setCounts(c => { const n = [...c]; n[i] += voted[i] ? -1 : 1; return n; });
    } else {
      setVoted(options.map((_, idx) => idx === i));
      setCounts(c => {
        const n = [...c];
        const prev = voted.indexOf(true);
        if (prev >= 0 && prev !== i) n[prev] -= 1;
        if (!voted[i]) n[i] += 1;
        return n;
      });
    }
    if (onVote) onVote(i);
  }

  return (
    <div className={[styles.poll, mine ? styles.mine : ''].join(' ')}>
      <div className={styles.q}>
        <PollIcon size={16} /> {question}
      </div>
      {options.map((o, i) => {
        const pct = totalNow ? Math.round((counts[i] / totalNow) * 100) : 0;
        return (
          <button
            key={i}
            type="button"
            className={[styles.opt, voted[i] ? styles.voted : ''].join(' ')}
            onClick={() => vote(i)}
          >
            <span className={styles.fill} style={{ width: `${pct}%` }} aria-hidden />
            <span className={styles.lbl}>
              <span>{voted[i] ? '✓ ' : ''}{o.label}</span>
              <span className={styles.pct}>{pct}%</span>
            </span>
          </button>
        );
      })}
      <div className={styles.total}>
        {totalNow} {totalNow === 1 ? 'voto' : 'votos'}
        {multiple ? ' • múltipla escolha' : ' • clique para votar'}
      </div>
    </div>
  );
}
