import styles from './Button.module.css';

export default function Button({
  type = 'button',
  variant = 'solid', // solid | ghost | outline | danger | text | primary | success
  size = 'md',       // sm | md | lg
  block = false,
  loading = false,
  disabled = false,
  danger = false,
  iconLeft = null,
  iconRight = null,
  className = '',
  children,
  ...rest
}) {
  const v = variant === 'primary' ? 'solid' : variant;
  const cls = [
    styles.btn,
    styles[`v_${v}`],
    styles[`s_${size}`],
    block ? styles.block : '',
    danger ? styles.danger : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {iconLeft ? <span className={styles.icon} aria-hidden>{iconLeft}</span> : null}
      <span className={styles.label}>{loading ? 'Aguarde…' : children}</span>
      {iconRight ? <span className={styles.icon} aria-hidden>{iconRight}</span> : null}
    </button>
  );
}
