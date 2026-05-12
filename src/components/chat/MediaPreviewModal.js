'use client';
import { useEffect, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/services/api';
import { formatBytes } from '@/lib/format';
import { RotateIcon, HdIcon, CropIcon, XIcon } from '@/components/icons/Icons';
import styles from './MediaPreviewModal.module.css';

// ─── Crop Overlay ─────────────────────────────────────────────────────────────

function CropOverlay({ imgSrc, onConfirm, onCancel }) {
  const imgRef = useRef(null);
  const [sel, setSel] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const dragRef = useRef(null);

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function startDrag(e, type) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { type, startX: e.clientX, startY: e.clientY, startSel: { ...sel } };

    function onMove(ev) {
      const imgEl = imgRef.current;
      if (!imgEl || !dragRef.current) return;
      const rect = imgEl.getBoundingClientRect();
      const dx = (ev.clientX - dragRef.current.startX) / rect.width;
      const dy = (ev.clientY - dragRef.current.startY) / rect.height;
      const { type: t, startSel: s } = dragRef.current;
      const MIN = 0.06;
      let { x, y, w, h } = s;

      if (t === 'move') {
        x = clamp(s.x + dx, 0, 1 - s.w);
        y = clamp(s.y + dy, 0, 1 - s.h);
      } else if (t === 'se') {
        w = clamp(s.w + dx, MIN, 1 - s.x);
        h = clamp(s.h + dy, MIN, 1 - s.y);
      } else if (t === 'nw') {
        const nx = clamp(s.x + dx, 0, s.x + s.w - MIN);
        const ny = clamp(s.y + dy, 0, s.y + s.h - MIN);
        w = s.w - (nx - s.x); h = s.h - (ny - s.y); x = nx; y = ny;
      } else if (t === 'ne') {
        const ny = clamp(s.y + dy, 0, s.y + s.h - MIN);
        w = clamp(s.w + dx, MIN, 1 - s.x);
        h = s.h - (ny - s.y); y = ny;
      } else if (t === 'sw') {
        const nx = clamp(s.x + dx, 0, s.x + s.w - MIN);
        w = s.w - (nx - s.x); h = clamp(s.h + dy, MIN, 1 - s.y); x = nx;
      }
      setSel({ x, y, w, h });
    }

    function onUp() {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function doConfirm() {
    const img = imgRef.current;
    if (!img) return;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const cx = Math.round(sel.x * iw), cy = Math.round(sel.y * ih);
    const cw = Math.round(sel.w * iw), ch = Math.round(sel.h * ih);
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    canvas.getContext('2d').drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'cropped.jpg', { type: 'image/jpeg' });
      onConfirm(file, URL.createObjectURL(blob));
    }, 'image/jpeg', 0.92);
  }

  const pct = (v) => `${(v * 100).toFixed(2)}%`;
  const { x, y, w, h } = sel;
  const x2 = x + w, y2 = y + h;

  const handles = [
    ['nw', x, y, 'nwse-resize'],
    ['ne', x2, y, 'nesw-resize'],
    ['sw', x, y2, 'nesw-resize'],
    ['se', x2, y2, 'nwse-resize'],
  ];

  return (
    <div className={styles.cropWrap}>
      <div className={styles.cropContainer}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={imgSrc} alt="" className={styles.cropImg} draggable={false} />
        {/* 4 dark overlay pieces around the selection */}
        <div className={styles.cropDark} style={{ top: 0, left: 0, right: 0, height: pct(y) }} />
        <div className={styles.cropDark} style={{ top: pct(y2), left: 0, right: 0, bottom: 0 }} />
        <div className={styles.cropDark} style={{ top: pct(y), left: 0, width: pct(x), height: pct(h) }} />
        <div className={styles.cropDark} style={{ top: pct(y), left: pct(x2), right: 0, height: pct(h) }} />
        {/* Selection box */}
        <div
          className={styles.cropSel}
          style={{ left: pct(x), top: pct(y), width: pct(w), height: pct(h) }}
          onMouseDown={(e) => startDrag(e, 'move')}
        >
          {/* Rule-of-thirds grid lines */}
          <div className={styles.cropGrid} />
          {/* Corner handles */}
          {handles.map(([t, lf, tp, cur]) => (
            <div
              key={t}
              className={`${styles.cropHandle} ${styles[`cH_${t}`]}`}
              style={{ left: pct((lf - x) / w), top: pct((tp - y) / h), cursor: cur }}
              onMouseDown={(e) => startDrag(e, t)}
            />
          ))}
        </div>
      </div>
      <div className={styles.cropActions}>
        <Button variant="ghost" onClick={onCancel}><XIcon size={14} /> Cancelar corte</Button>
        <Button onClick={doConfirm}>Confirmar corte</Button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MediaPreviewModal({ open, initial, onClose, onSend, queueIndex = 0, queueTotal = 1 }) {
  const { toast } = useToast();
  const [caption, setCaption] = useState('');
  const [hd, setHd] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cropMode, setCropMode] = useState(false);
  // current file/src after optional crop
  const [file, setFile] = useState(null);
  const [src, setSrc] = useState(null);

  // Reset state when modal opens with a new file
  useEffect(() => {
    if (open && initial) {
      setCaption('');
      setHd(false);
      setRotation(0);
      setProgress(0);
      setBusy(false);
      setCropMode(false);
      setFile(initial.file || null);
      setSrc(initial.src || null);
    }
  }, [open, initial]);

  if (!open || !initial) return null;

  const kind = initial.kind;
  const isImage = kind === 'image' || kind === 'gif';
  const isVideo = kind === 'video';
  const isAudio = kind === 'audio';
  const viewOnly = !!initial.view;

  function applyCrop(newFile, newSrc) {
    setFile(newFile);
    setSrc(newSrc);
    setCropMode(false);
    setRotation(0); // crop applied — reset rotation
  }

  async function send() {
    if (busy) return;
    if (!file && !viewOnly) { onClose?.(); return; }
    if (viewOnly) { onClose?.(); return; }
    setBusy(true);
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kindHint', kind);
      fd.append('hd', hd ? '1' : '0');
      if (rotation) fd.append('rotate', String(rotation));
      const arr = await api.uploadWithProgress('/api/uploads', fd, (pct) => setProgress(pct));
      const data = Array.isArray(arr) ? arr[0] : arr;
      if (!data) throw new Error('upload_empty');
      onSend?.({
        body: caption || null,
        attachments: [{
          kind: data.kind || kind,
          storage_path: data.storage_path,
          thumb_path: data.thumb_path || null,
          poster_path: data.poster_path || null,
          filename: file?.name || initial.name || null,
          size: data.size,
          width: data.width,
          height: data.height,
          duration_ms: data.duration_ms,
          mime: data.mime,
          hd: data.hd,
        }],
      });
    } catch (err) {
      toast(errMsg(err), { tone: 'danger' });
      setBusy(false);
    }
  }

  const queueLabel = queueTotal > 1 ? ` (${queueIndex + 1} de ${queueTotal})` : '';
  const modalTitle = viewOnly ? 'Visualizar' : `Pré-visualizar envio${queueLabel}`;

  if (cropMode) {
    return (
      <Modal open={open} onClose={() => setCropMode(false)} width={720} title="Cortar imagem">
        <CropOverlay
          imgSrc={src}
          onConfirm={applyCrop}
          onCancel={() => setCropMode(false)}
        />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={!busy ? onClose : undefined}
      width={720}
      title={modalTitle}
      footer={
        viewOnly ? (
          <Button onClick={onClose}>Fechar</Button>
        ) : (
          <div className={styles.footerRow}>
            <div className={styles.footerLeft}>
              {isImage ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    aria-label="Girar 90°"
                    disabled={busy}
                  >
                    <RotateIcon size={16} /> Girar
                  </Button>
                  {kind === 'image' ? (
                    <Button
                      variant="ghost"
                      onClick={() => setCropMode(true)}
                      aria-label="Cortar imagem"
                      disabled={busy}
                    >
                      <CropIcon size={16} /> Cortar
                    </Button>
                  ) : null}
                  <Button
                    variant={hd ? 'primary' : 'ghost'}
                    onClick={() => setHd((s) => !s)}
                    aria-label="Qualidade HD"
                    disabled={busy}
                  >
                    <HdIcon size={16} /> HD
                  </Button>
                </>
              ) : null}
            </div>
            <div className={styles.footerRight}>
              {busy ? (
                <span className={styles.progressLabel}>{progress}%</span>
              ) : null}
              <Button onClick={send} loading={busy} disabled={busy}>
                {busy ? 'Enviando…' : (queueTotal > 1 ? `Enviar (${queueIndex + 1}/${queueTotal})` : 'Enviar')}
              </Button>
            </div>
          </div>
        )
      }
    >
      <div className={styles.body}>
        <div className={styles.preview}>
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src || initial.src}
              alt={initial.name || ''}
              className={styles.image}
              style={{ transform: `rotate(${rotation}deg)` }}
            />
          ) : isVideo ? (
            <video controls className={styles.video} src={src || initial.src} />
          ) : isAudio ? (
            <audio controls className={styles.audio} src={src || initial.src} />
          ) : (
            <div className={styles.fileBox}>
              <div className={styles.fileName}>{initial.name || 'Arquivo'}</div>
              {file ? <div className={styles.fileSize}>{formatBytes(file.size)}</div> : null}
            </div>
          )}
        </div>

        {/* Upload progress bar */}
        {busy ? (
          <div className={styles.progressWrap} aria-label={`Enviando: ${progress}%`}>
            <div className={styles.progressBar} style={{ width: `${progress}%` }} />
          </div>
        ) : null}

        {!viewOnly ? (
          <div className={styles.captionRow}>
            <Input
              placeholder="Adicionar legenda…"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={1024}
              aria-label="Legenda"
              disabled={busy}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function errMsg(err) {
  if (err?.code === 'photo_too_large') return 'Foto muito grande (máx. 80 MB).';
  if (err?.code === 'video_too_large') return 'Vídeo muito grande (máx. 320 MB).';
  if (err?.code === 'file_too_large') return 'Arquivo muito grande (máx. 2 GB).';
  if (err?.code === 'unsupported_type') return 'Tipo de arquivo não suportado.';
  if (err?.code === 'network_error') return 'Falha de rede. Verifique sua conexão.';
  if (err?.code === 'rate_limited') return 'Limite de uploads atingido. Aguarde um momento.';
  return 'Falha ao enviar arquivo.';
}
