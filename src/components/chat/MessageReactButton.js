'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SmileIcon } from '@/components/icons/Icons';
import styles from './MessageReactButton.module.css';

/**
 * Botão "smile" de reação rápida — aparece FORA da bolha, alinhado verticalmente
 * ao centro dela, no lado oposto à mensagem (esquerda das minhas, direita das
 * recebidas). Visível só no hover da bolha.
 *
 * Click abre o ReactionPicker via REACT PORTAL com `position: fixed` e top/left
 * CLAMPED à viewport — nunca renderiza fora da tela.
 */
const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const MORE  = ['👏', '🔥', '🎉', '✅', '❌', '👀', '🤔', '🤣', '😍', '😎', '🥺', '💯'];

const PICKER_W = 290;
const PICKER_H_BASE = 50;   // 1 linha; cresce se "mais" abrir
const PAD = 8;

export default function MessageReactButton({ isMine, onPick }) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [pos, setPos] = useState(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (pickerRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const onWin = () => recompute();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, more]);

  function close() { setOpen(false); setMore(false); }

  function recompute() {
    const trig = triggerRef.current?.getBoundingClientRect();
    if (!trig) return;
    const m = pickerRef.current?.getBoundingClientRect();
    const ph = m?.height || (more ? PICKER_H_BASE * 2 : PICKER_H_BASE);
    const pw = m?.width || PICKER_W;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // preferência: acima do botão
    let top = trig.top - ph - 6;
    if (top < PAD) top = trig.bottom + 6;
    top = Math.max(PAD, Math.min(top, vh - ph - PAD));
    // alinhar pela borda do botão; clamp na viewport
    let left = trig.left + trig.width / 2 - pw / 2;
    left = Math.max(PAD, Math.min(left, vw - pw - PAD));
    setPos({ top, left });
  }

  function handlePick(em) {
    onPick?.(em);
    close();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-message-react
        className={[styles.button, open ? styles.buttonOpen : ''].join(' ')}
        onClick={(e) => { e.stopPropagation(); setOpen((s) => !s); }}
        aria-label="Reagir à mensagem"
        aria-expanded={open}
        title="Reagir"
      >
        <SmileIcon size={18} />
      </button>

      {open && mounted ? createPortal(
        <div
          ref={pickerRef}
          className={styles.picker}
          role="menu"
          aria-label="Escolher reação"
          style={pos ? { top: pos.top, left: pos.left, width: PICKER_W }
                     : { visibility: 'hidden', top: 0, left: 0, width: PICKER_W }}
        >
          <div className={styles.row}>
            {QUICK.map((em) => (
              <button
                key={em}
                type="button"
                className={styles.emojiBtn}
                onClick={(e) => { e.stopPropagation(); handlePick(em); }}
                aria-label={`Reagir com ${em}`}
              >
                {em}
              </button>
            ))}
            <button
              type="button"
              className={[styles.emojiBtn, styles.moreBtn].join(' ')}
              onClick={(e) => { e.stopPropagation(); setMore((s) => !s); }}
              aria-label={more ? 'Menos reações' : 'Mais reações'}
              title={more ? 'Menos' : 'Mais'}
            >
              +
            </button>
          </div>
          {more ? (
            <div className={styles.row}>
              {MORE.map((em) => (
                <button
                  key={em}
                  type="button"
                  className={styles.emojiBtn}
                  onClick={(e) => { e.stopPropagation(); handlePick(em); }}
                  aria-label={`Reagir com ${em}`}
                >
                  {em}
                </button>
              ))}
            </div>
          ) : null}
        </div>,
        document.body
      ) : null}
    </>
  );
}
