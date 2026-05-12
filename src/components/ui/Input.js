import { useId } from 'react';
import styles from './Input.module.css';

export function Field({ label, hint, error, children, htmlFor }) {
  const id = useId();
  const fid = htmlFor || id;
  const child = typeof children === 'function' ? children(fid) : children;
  return (
    <label className={styles.field} htmlFor={fid}>
      {label ? <span className={styles.label}>{label}</span> : null}
      {child}
      {error ? <span className={styles.err}>{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  );
}

export function Input({ invalid = false, className = '', ...rest }) {
  return <input className={[styles.input, invalid ? styles.invalid : '', className].filter(Boolean).join(' ')} {...rest} />;
}

export function Textarea({ invalid = false, className = '', rows = 3, ...rest }) {
  return <textarea className={[styles.input, styles.textarea, invalid ? styles.invalid : '', className].filter(Boolean).join(' ')} rows={rows} {...rest} />;
}
