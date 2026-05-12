'use client';
import { useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { ImageIcon, TypeIcon } from '@/components/icons/Icons';
import styles from './StoryComposer.module.css';

const BG_PRESETS = [
  'linear-gradient(135deg, #f43f5e, #f59e0b)',
  'linear-gradient(135deg, #6366f1, #ec4899)',
  'linear-gradient(135deg, #10b981, #0ea5e9)',
  'linear-gradient(135deg, #8b5cf6, #6366f1)',
  'linear-gradient(135deg, #fbbf24, #f97316)',
  'linear-gradient(135deg, #06b6d4, #6366f1)',
  'linear-gradient(135deg, #14b8a6, #84cc16)',
  '#0f172a',
];

/**
 * Compositor de stories — texto sobre gradiente OU upload de imagem.
 * Demonstrativo: stories são salvas no localStorage por enquanto.
 */
export default function StoryComposer({ open, onClose, onShare }) {
  const [mode, setMode] = useState('text'); // 'text' | 'image'
  const [text, setText] = useState('');
  const [bg, setBg] = useState(BG_PRESETS[0]);
  const [imgUrl, setImgUrl] = useState(null);
  const fileRef = useRef(null);

  function pickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setImgUrl(url);
    setMode('image');
  }

  function share() {
    const story = {
      id: 'story_' + Date.now(),
      type: mode,
      text: mode === 'text' ? text : null,
      image: mode === 'image' ? imgUrl : null,
      bg: mode === 'text' ? bg : null,
      createdAt: Date.now(),
    };
    onShare?.(story);
    setText(''); setImgUrl(null); setMode('text');
    onClose?.();
  }

  return (
    <Modal open={open} onClose={onClose} title="Criar story" width={420}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={share} disabled={mode === 'text' ? !text.trim() : !imgUrl}>
            Compartilhar
          </Button>
        </>
      )}
    >
      <div className={styles.modeTabs}>
        <button type="button" className={[styles.modeTab, mode === 'text' ? styles.active : ''].join(' ')} onClick={() => setMode('text')}>
          <TypeIcon size={16} /> Texto
        </button>
        <button type="button" className={[styles.modeTab, mode === 'image' ? styles.active : ''].join(' ')} onClick={() => fileRef.current?.click()}>
          <ImageIcon size={16} /> Imagem
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} hidden />
      </div>

      <div
        className={styles.preview}
        style={mode === 'image' && imgUrl
          ? { backgroundImage: `url(${imgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: bg }}
      >
        {mode === 'text' ? (
          <textarea
            className={styles.input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="O que você quer compartilhar?"
            maxLength={120}
            autoFocus
          />
        ) : null}
        {mode === 'image' && !imgUrl ? (
          <div className={styles.imgPrompt}>Clique em Imagem para escolher</div>
        ) : null}
      </div>

      {mode === 'text' ? (
        <div className={styles.bgPicker}>
          {BG_PRESETS.map((b, i) => (
            <button
              key={i}
              type="button"
              className={[styles.bgOpt, bg === b ? styles.bgActive : ''].join(' ')}
              style={{ background: b }}
              onClick={() => setBg(b)}
              aria-label={`Fundo ${i + 1}`}
            />
          ))}
        </div>
      ) : null}
    </Modal>
  );
}
