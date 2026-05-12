'use client';
import styles from './Skeleton.module.css';

export function Skeleton({ width, height, rounded, className, style }) {
  const s = { width, height, ...style };
  if (rounded === 'pill') s.borderRadius = 999;
  else if (rounded === 'circle') s.borderRadius = '50%';
  else if (rounded != null) s.borderRadius = rounded;
  return <span className={['skel', styles.block, className].filter(Boolean).join(' ')} style={s} aria-hidden="true" />;
}

export function ChatListSkeleton({ count = 8 }) {
  return (
    <div className={styles.list} aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.row}>
          <Skeleton width={48} height={48} rounded="circle" />
          <div className={styles.rowBody}>
            <div className={styles.rowLine}>
              <Skeleton height={12} width={`${50 + (i % 4) * 10}%`} />
              <Skeleton height={10} width={32} />
            </div>
            <div className={styles.rowLine}>
              <Skeleton height={10} width={`${40 + (i % 5) * 10}%`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ThreadSkeleton({ count = 5 }) {
  return (
    <div className={styles.thread} aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => {
        const mine = i % 3 === 0;
        return (
          <div key={i} className={[styles.bubbleRow, mine ? styles.right : styles.left].join(' ')}>
            <Skeleton
              width={`${30 + ((i * 17) % 50)}%`}
              height={30 + ((i * 11) % 30)}
              rounded={14}
              className={mine ? styles.bubbleMine : styles.bubbleTheirs}
            />
          </div>
        );
      })}
    </div>
  );
}
