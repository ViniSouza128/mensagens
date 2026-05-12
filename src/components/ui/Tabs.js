'use client';
import styles from './Tabs.module.css';

export default function Tabs({ value, onChange, items }) {
  return (
    <div className={styles.tabs} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          className={[styles.tab, value === it.value ? styles.active : ''].join(' ')}
          onClick={() => onChange?.(it.value)}
        >
          {it.label}
          {it.badge ? <span className={styles.badge}>{it.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
