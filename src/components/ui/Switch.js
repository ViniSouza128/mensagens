import styles from './Switch.module.css';

export default function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className={styles.row}>
      <span className={styles.label}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={[styles.switch, checked ? styles.on : ''].join(' ')}
        onClick={() => !disabled && onChange?.(!checked)}
      >
        <span className={styles.knob} />
      </button>
    </label>
  );
}
