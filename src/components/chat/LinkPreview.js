'use client';
import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import styles from './LinkPreview.module.css';

const cache = new Map();

export default function LinkPreview({ url, compact = false }) {
  const [data, setData] = useState(() => cache.get(url) || null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!url) return;
    if (cache.has(url)) { setData(cache.get(url)); return; }
    let cancel = false;
    api.get(`/api/linkpreview?url=${encodeURIComponent(url)}`)
      .then((d) => { if (!cancel) { cache.set(url, d); setData(d); } })
      .catch(() => { if (!cancel) setErr(true); });
    return () => { cancel = true; };
  }, [url]);

  if (err || !data) return null;
  const { title, description, image, site_name } = data;
  if (!title && !description && !image) return null;

  return (
    <a className={[styles.wrap, compact ? styles.compact : ''].join(' ')} href={url} target="_blank" rel="noopener noreferrer">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.thumb} src={image} alt="" loading="lazy" />
      ) : null}
      <div className={styles.body}>
        {site_name ? <div className={styles.site}>{site_name}</div> : null}
        {title ? <div className={styles.title}>{title}</div> : null}
        {description ? <div className={styles.desc}>{description}</div> : null}
      </div>
    </a>
  );
}
