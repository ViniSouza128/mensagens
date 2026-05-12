'use client';
import Button from './Button';
import styles from './EmptyState.module.css';

export default function EmptyState({ icon, title, description, action, secondary, compact, children }) {
  return (
    <div className={[styles.wrap, compact ? styles.compact : ''].join(' ')}>
      {icon ? <div className={styles.icon} aria-hidden="true">{icon}</div> : null}
      {title ? <p className={styles.title}>{title}</p> : null}
      {description ? <p className={styles.desc}>{description}</p> : null}
      {children ? <div className={styles.body}>{children}</div> : null}
      {action || secondary ? (
        <div className={styles.actions}>
          {action ? (
            <Button onClick={action.onClick}>{action.label}</Button>
          ) : null}
          {secondary ? (
            <Button variant="ghost" onClick={secondary.onClick}>{secondary.label}</Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
