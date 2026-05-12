import styles from './IconButton.module.css';

export default function IconButton({
  size = 'md',
  variant = 'ghost',
  active = false,
  className = '',
  label,
  tipPos,           // 'top' (default) | 'bottom' | 'left' | 'right'
  children,
  ...rest
}) {
  const cls = [
    styles.btn,
    styles[`v_${variant}`],
    styles[`s_${size}`],
    active ? styles.active : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-tip={label || undefined}
      data-tip-pos={tipPos || undefined}
      className={cls}
      {...rest}
    >
      {children}
    </button>
  );
}
