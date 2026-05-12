'use client';
import { DownloadIcon } from '@/components/icons/Icons';
import styles from './FilePreview.module.css';

/* SVG thumbnails coloridos por tipo de arquivo */
const THUMBS = {
  pdf: (
    <svg viewBox="0 0 80 100" className={styles.thumbSvg} aria-hidden>
      <defs><linearGradient id="fp-pdf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff5f5"/><stop offset="1" stopColor="#fed7d7"/></linearGradient></defs>
      <rect x="2" y="2" width="76" height="96" rx="6" fill="url(#fp-pdf)" stroke="#fc8181" strokeWidth="1.5"/>
      <rect x="40" y="62" width="32" height="20" rx="3" fill="#e53e3e"/>
      <text x="56" y="76" textAnchor="middle" fontFamily="-apple-system,sans-serif" fontWeight="800" fontSize="11" fill="#fff">PDF</text>
      <line x1="12" y1="20" x2="68" y2="20" stroke="#fc8181" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="12" y1="28" x2="60" y2="28" stroke="#fc8181" strokeWidth="1.5" strokeLinecap="round" opacity=".7"/>
      <line x1="12" y1="36" x2="64" y2="36" stroke="#fc8181" strokeWidth="1.5" strokeLinecap="round" opacity=".7"/>
      <line x1="12" y1="44" x2="56" y2="44" stroke="#fc8181" strokeWidth="1.5" strokeLinecap="round" opacity=".5"/>
    </svg>
  ),
  doc: (
    <svg viewBox="0 0 80 100" className={styles.thumbSvg} aria-hidden>
      <defs><linearGradient id="fp-doc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ebf8ff"/><stop offset="1" stopColor="#bee3f8"/></linearGradient></defs>
      <rect x="2" y="2" width="76" height="96" rx="6" fill="url(#fp-doc)" stroke="#63b3ed" strokeWidth="1.5"/>
      <rect x="40" y="62" width="32" height="20" rx="3" fill="#3182ce"/>
      <text x="56" y="76" textAnchor="middle" fontFamily="-apple-system,sans-serif" fontWeight="800" fontSize="11" fill="#fff">DOC</text>
      <line x1="12" y1="20" x2="68" y2="20" stroke="#63b3ed" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="12" y1="28" x2="60" y2="28" stroke="#63b3ed" strokeWidth="1.5" strokeLinecap="round" opacity=".7"/>
      <line x1="12" y1="36" x2="64" y2="36" stroke="#63b3ed" strokeWidth="1.5" strokeLinecap="round" opacity=".7"/>
    </svg>
  ),
  xls: (
    <svg viewBox="0 0 80 100" className={styles.thumbSvg} aria-hidden>
      <defs><linearGradient id="fp-xls" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f0fff4"/><stop offset="1" stopColor="#c6f6d5"/></linearGradient></defs>
      <rect x="2" y="2" width="76" height="96" rx="6" fill="url(#fp-xls)" stroke="#48bb78" strokeWidth="1.5"/>
      <rect x="40" y="62" width="32" height="20" rx="3" fill="#38a169"/>
      <text x="56" y="76" textAnchor="middle" fontFamily="-apple-system,sans-serif" fontWeight="800" fontSize="11" fill="#fff">XLS</text>
      <g stroke="#48bb78" strokeWidth="1.2" fill="none">
        <line x1="12" y1="20" x2="68" y2="20"/><line x1="12" y1="30" x2="68" y2="30"/>
        <line x1="12" y1="40" x2="68" y2="40"/><line x1="12" y1="50" x2="40" y2="50"/>
        <line x1="12" y1="20" x2="12" y2="50"/><line x1="40" y1="20" x2="40" y2="50"/>
      </g>
    </svg>
  ),
  zip: (
    <svg viewBox="0 0 80 100" className={styles.thumbSvg} aria-hidden>
      <defs><linearGradient id="fp-zip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fffaf0"/><stop offset="1" stopColor="#feebc8"/></linearGradient></defs>
      <rect x="2" y="2" width="76" height="96" rx="6" fill="url(#fp-zip)" stroke="#dd6b20" strokeWidth="1.5"/>
      <rect x="40" y="62" width="32" height="20" rx="3" fill="#dd6b20"/>
      <text x="56" y="76" textAnchor="middle" fontFamily="-apple-system,sans-serif" fontWeight="800" fontSize="11" fill="#fff">ZIP</text>
      <path d="M30 10 v8 h6 v8 h-6 v8 h6 v8 h-6 v6 a6 6 0 0 0 6 6 h12 a6 6 0 0 0 6 -6 v-26 a4 4 0 0 0 -4 -4 h-14 v-8 z" fill="#dd6b20" opacity=".25"/>
    </svg>
  ),
  fig: (
    <svg viewBox="0 0 80 100" className={styles.thumbSvg} aria-hidden>
      <defs><linearGradient id="fp-fig" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#faf5ff"/><stop offset="1" stopColor="#e9d8fd"/></linearGradient></defs>
      <rect x="2" y="2" width="76" height="96" rx="6" fill="url(#fp-fig)" stroke="#9f7aea" strokeWidth="1.5"/>
      <g transform="translate(20 18) scale(1.6)" stroke="none">
        <circle cx="6" cy="6" r="6" fill="#f24e1e"/>
        <circle cx="18" cy="6" r="6" fill="#a259ff"/>
        <circle cx="6" cy="18" r="6" fill="#1abcfe"/>
        <circle cx="6" cy="30" r="6" fill="#0acf83"/>
        <circle cx="18" cy="18" r="6" fill="#ff7262"/>
      </g>
      <rect x="40" y="78" width="32" height="14" rx="3" fill="#9f7aea"/>
      <text x="56" y="88" textAnchor="middle" fontFamily="-apple-system,sans-serif" fontWeight="800" fontSize="9" fill="#fff">FIG</text>
    </svg>
  ),
};

function detectKind(filename) {
  if (!filename) return 'doc';
  const ext = filename.split('.').pop().toLowerCase();
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'doc';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'xls';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'zip';
  if (['fig', 'sketch', 'xd'].includes(ext)) return 'fig';
  return 'doc';
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

/**
 * Bubble de arquivo com thumbnail por tipo, nome, tamanho e botão download.
 * Props: filename, size (bytes), kind ('pdf'|'doc'|'xls'|'zip'|'fig'), meta (string), url, mine
 */
export default function FilePreview({ filename, size, kind, meta, url, mine = false, onDownload }) {
  const k = kind || detectKind(filename);
  const sz = typeof size === 'number' ? formatBytes(size) : size;
  return (
    <div className={[styles.file, mine ? styles.mine : ''].join(' ')}>
      <div className={styles.thumb}>{THUMBS[k] || THUMBS.doc}</div>
      <div className={styles.info}>
        <strong className={styles.name}>{filename || 'arquivo'}</strong>
        <div className={styles.det}>
          {k.toUpperCase()}
          {sz ? ` • ${sz}` : ''}
          {meta ? ` • ${meta}` : ''}
        </div>
      </div>
      <button
        type="button"
        className={styles.dl}
        onClick={() => { if (onDownload) onDownload(); else if (url) window.open(url); }}
        aria-label="Baixar"
      >
        <DownloadIcon size={16} />
      </button>
    </div>
  );
}
