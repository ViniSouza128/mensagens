'use client';
import { useEffect, useRef } from 'react';
import { PlusIcon } from '@/components/icons/Icons';
import Avatar from '@/components/ui/Avatar';
import styles from './StoriesBar.module.css';

/**
 * Barra de stories no topo da chat list.
 *
 * Props:
 *   stories:    [{ id, name, avatar, seen }]
 *   myStories:  [{ id, type, text, image, bg, createdAt }]  — stories do próprio usuário
 *   me:         { id, name, avatar_path }
 *   onPick:     (storyId) => void                     — clique em story de outro
 *   onAdd:      () => void                            — clique em "+ Você"
 *   onPickMine: () => void                            — clique no avatar próprio (com stories)
 *
 * Interação de scroll horizontal:
 *   - Scroll do mouse (wheel) → rola horizontal (não a página).
 *   - Click-and-drag → arrasta a barra horizontalmente.
 *   - Touchscreen funciona nativo (overflow-x: auto).
 */
export default function StoriesBar({ stories = [], myStories = [], me, onPick, onAdd, onPickMine }) {
  const hasMine = myStories.length > 0;
  const scrollRef = useRef(null);

  // ── Mouse wheel → scroll horizontal ────────────────────────────────────
  // Por padrão, deltaY do wheel só rola na vertical. Aqui converte para X.
  // Listener com `passive: false` pra poder chamar preventDefault e impedir
  // o scroll vertical da página enquanto o cursor está na barra.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.deltaY === 0) return;
      // Se o usuário está rolando vertical com shift OU já tem deltaX, deixa nativo.
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Click-and-drag horizontal ───────────────────────────────────────────
  // Marca posição inicial no mousedown e ajusta scrollLeft conforme o mouse
  // move. Suprime o click final se houve drag significativo (>3px), pra não
  // abrir story acidentalmente quando o usuário só queria rolar.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let isDown = false;
    let startX = 0;
    let startScroll = 0;
    let dragged = false;

    const onDown = (e) => {
      // Só botão esquerdo
      if (e.button !== 0) return;
      isDown = true;
      dragged = false;
      startX = e.pageX;
      startScroll = el.scrollLeft;
      el.classList.add(styles.dragging);
    };
    const onMove = (e) => {
      if (!isDown) return;
      const dx = e.pageX - startX;
      if (Math.abs(dx) > 3) dragged = true;
      el.scrollLeft = startScroll - dx;
    };
    const endDrag = () => {
      isDown = false;
      el.classList.remove(styles.dragging);
    };
    // Suprime clique se houve drag (capture: true pra interceptar antes do button onClick)
    const onClickCapture = (e) => {
      if (dragged) {
        e.preventDefault();
        e.stopPropagation();
      }
      dragged = false;
    };

    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', endDrag);
    el.addEventListener('click', onClickCapture, true);
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', endDrag);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  return (
    <div ref={scrollRef} className={styles.stories} role="list" aria-label="Stories">
      <button
        type="button"
        className={styles.story}
        onClick={hasMine ? onPickMine : onAdd}
        role="listitem"
        aria-label={hasMine ? 'Ver meus stories' : 'Adicionar story'}
      >
        {hasMine ? (
          <div className={[styles.ring, styles.ringMine].join(' ')}>
            <Avatar name={me?.name || 'Você'} src={me?.avatar_path} size={48} />
            <span className={styles.addBadge} aria-hidden>+</span>
          </div>
        ) : (
          <div className={[styles.ring, styles.ringAdd].join(' ')}>
            <PlusIcon size={20} />
          </div>
        )}
        <span className={styles.name}>{hasMine ? 'Seu story' : 'Você'}</span>
      </button>
      {stories.map(s => (
        <button
          key={s.id}
          type="button"
          className={styles.story}
          onClick={() => onPick?.(s.id)}
          role="listitem"
        >
          <div className={[styles.ring, s.seen ? styles.ringSeen : ''].join(' ')}>
            <Avatar name={s.name} src={s.avatar} size={48} />
          </div>
          <span className={styles.name}>{s.name}</span>
        </button>
      ))}
    </div>
  );
}
