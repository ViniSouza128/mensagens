import { initials } from '@/lib/format';
import { gradientFromString } from '@/lib/colors';
import styles from './Avatar.module.css';

export default function Avatar({ name, src, size = 40, online = false, alt, eager = false }) {
  const bg = gradientFromString(name || 'x');
  const dim = { width: size, height: size, fontSize: Math.max(11, Math.floor(size * 0.4)) };
  const url = src ? (src.startsWith('http') ? src : `/api/files/${src}`) : null;
  return (
    <div className={styles.wrap} style={{ width: size, height: size }}>
      <div
        className={styles.avatar}
        style={url ? { ...dim } : { ...dim, background: bg, color: '#fff' }}
        aria-label={alt || name || 'avatar'}
        role="img"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={alt || name || 'avatar'}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            fetchpriority={eager ? 'high' : 'low'}
            width={size}
            height={size}
          />
        ) : (
          <span aria-hidden>{initials(name)}</span>
        )}
      </div>
      {online ? <span className={styles.dot} aria-hidden /> : null}
    </div>
  );
}
