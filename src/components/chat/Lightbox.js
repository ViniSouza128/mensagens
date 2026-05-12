'use client';
import { useEffect, useRef, useState } from 'react';
import { XIcon, ChevronRightIcon, DownloadIcon } from '@/components/icons/Icons';
import styles from './Lightbox.module.css';

export default function Lightbox({ open, items, index = 0, onClose, onIndexChange }) {
  const [i, setI] = useState(index);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const touchRef = useRef(null);

  useEffect(() => { setI(index); setScale(1); setPan({ x: 0, y: 0 }); }, [index]);
  useEffect(() => { onIndexChange?.(i); }, [i, onIndexChange]);

  // Reset zoom on item change
  useEffect(() => { setScale(1); setPan({ x: 0, y: 0 }); }, [i]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === '+' || e.key === '=') zoomIn();
      if (e.key === '-') zoomOut();
      if (e.key === '0') resetZoom();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, i, items?.length]);

  if (!open || !items || items.length === 0) return null;
  const cur = items[i];
  const hasMany = items.length > 1;

  function next() { if (hasMany) setI((v) => (v + 1) % items.length); }
  function prev() { if (hasMany) setI((v) => (v - 1 + items.length) % items.length); }

  function zoomIn() { setScale((s) => Math.min(s * 1.5, 6)); }
  function zoomOut() { setScale((s) => Math.max(s / 1.5, 1)); if (scale <= 1.2) setPan({ x: 0, y: 0 }); }
  function resetZoom() { setScale(1); setPan({ x: 0, y: 0 }); }

  function onWheel(e) {
    if (cur.kind !== 'image' && cur.kind !== 'gif') return;
    e.preventDefault();
    const delta = -e.deltaY;
    setScale((s) => Math.max(1, Math.min(6, s * (delta > 0 ? 1.1 : 0.9))));
  }

  function onMouseDown(e) {
    if (scale <= 1) return;
    dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    function onMove(ev) {
      if (!dragRef.current) return;
      setPan({ x: ev.clientX - dragRef.current.x, y: ev.clientY - dragRef.current.y });
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function onDoubleClick() {
    if (scale > 1) resetZoom(); else setScale(2);
  }

  // Touch swipe to navigate (when not zoomed)
  function onTouchStart(e) {
    if (scale > 1) return;
    if (e.touches.length !== 1) return;
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e) {
    if (!touchRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 60) {
      if (dx < 0) next(); else prev();
    } else if (Math.abs(dy) > 100 && Math.abs(dx) < 60) {
      onClose?.();
    }
    touchRef.current = null;
  }

  function onBackdropClick(e) {
    if (e.target === e.currentTarget) onClose?.();
  }

  return (
    <div className={styles.backdrop} onMouseDown={onBackdropClick} onWheel={onWheel}>
      <div className={styles.toolbar}>
        <span className={styles.counter}>{hasMany ? `${i + 1} / ${items.length}` : ''} {cur.name ? `· ${cur.name}` : ''}</span>
        <div className={styles.toolBtns}>
          {(cur.kind === 'image' || cur.kind === 'gif') ? (
            <>
              <button className={styles.tBtn} onClick={zoomOut} aria-label="Diminuir zoom">−</button>
              <span className={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
              <button className={styles.tBtn} onClick={zoomIn} aria-label="Aumentar zoom">+</button>
            </>
          ) : null}
          <a className={styles.tBtn} href={cur.src} download={cur.name || true} aria-label="Baixar"><DownloadIcon size={16} /></a>
          <button className={styles.tBtn} onClick={onClose} aria-label="Fechar"><XIcon size={18} /></button>
        </div>
      </div>

      <div
        className={styles.canvas}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onDoubleClick={onDoubleClick}
        onMouseDown={onMouseDown}
        style={{ cursor: scale > 1 ? 'grab' : 'auto' }}
      >
        {cur.kind === 'video' ? (
          <video src={cur.src} controls autoPlay className={styles.video} />
        ) : cur.kind === 'audio' ? (
          <audio src={cur.src} controls autoPlay className={styles.audio} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cur.src}
            alt={cur.name || ''}
            className={styles.image}
            draggable={false}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
          />
        )}
      </div>

      {hasMany ? (
        <>
          <button className={[styles.nav, styles.navPrev].join(' ')} onClick={prev} aria-label="Anterior">
            <ChevronRightIcon size={28} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <button className={[styles.nav, styles.navNext].join(' ')} onClick={next} aria-label="Próximo">
            <ChevronRightIcon size={28} />
          </button>
          <div className={styles.dots}>
            {items.map((_, idx) => (
              <button
                key={idx}
                className={[styles.dot, idx === i ? styles.dotActive : ''].join(' ')}
                onClick={() => setI(idx)}
                aria-label={`Ir para ${idx + 1}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
