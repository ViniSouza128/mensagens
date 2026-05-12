'use client';
import { useEffect, useRef } from 'react';
import {
  ImageIcon, FileIcon, CameraIcon, PollIcon, GifIcon, StickerIcon,
} from '@/components/icons/Icons';
import styles from './AttachMenu.module.css';

/**
 * Popover menu de anexos (foto, vídeo, doc, câmera, enquete, GIF, sticker).
 * Props:
 *   open: bool
 *   onClose: () => void
 *   onPick: (kind: 'image'|'file'|'camera'|'poll'|'gif'|'sticker') => void
 *   anchor: ref opcional para posicionar (default: bottom-left)
 */
export default function AttachMenu({ open, onClose, onPick }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    setTimeout(() => document.addEventListener('mousedown', onClick), 10);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div ref={ref} className={styles.menu} role="menu">
      <button className={styles.item} onClick={() => { onPick?.('image'); onClose?.(); }} role="menuitem">
        <ImageIcon size={18} /> Foto / vídeo
      </button>
      <button className={styles.item} onClick={() => { onPick?.('file'); onClose?.(); }} role="menuitem">
        <FileIcon size={18} /> Documento
      </button>
      <button className={styles.item} onClick={() => { onPick?.('camera'); onClose?.(); }} role="menuitem">
        <CameraIcon size={18} /> Câmera
      </button>
      <button className={styles.item} onClick={() => { onPick?.('poll'); onClose?.(); }} role="menuitem">
        <PollIcon size={18} /> Enquete
      </button>
      <button className={styles.item} onClick={() => { onPick?.('gif'); onClose?.(); }} role="menuitem">
        <GifIcon size={18} /> GIF
      </button>
      <button className={styles.item} onClick={() => { onPick?.('sticker'); onClose?.(); }} role="menuitem">
        <StickerIcon size={18} /> Sticker
      </button>
    </div>
  );
}
