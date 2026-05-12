'use client';
import { useEffect, useRef, useState } from 'react';
import Avatar from '@/components/ui/Avatar';
import { XIcon, ChevronRightIcon, ArrowLeftIcon, TrashIcon, SendIcon } from '@/components/icons/Icons';
import styles from './StoryViewer.module.css';

/**
 * Visualizador full-screen de stories com auto-progress 5s, navegação ←/→,
 * pause on hold, fechar com Esc.
 *
 * Props:
 *   stories: [{ id, name, avatar, image?, time? }]
 *   index: índice inicial
 *   onClose: callback
 */
export default function StoryViewer({ stories, index: initial = 0, onClose, onDelete, onReply, mine = false }) {
  const [idx, setIdx] = useState(initial);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const rafRef = useRef(null);
  const startRef = useRef(0);
  const elapsedRef = useRef(0);

  const story = stories[idx];

  function next() { if (idx < stories.length - 1) { setIdx(idx + 1); resetProgress(); } else onClose?.(); }
  function prev() { if (idx > 0) { setIdx(idx - 1); resetProgress(); } }
  function resetProgress() { setProgress(0); elapsedRef.current = 0; startRef.current = performance.now(); }

  useEffect(() => {
    function tick(t) {
      if (paused) {
        startRef.current = t - elapsedRef.current;
      } else {
        elapsedRef.current = t - startRef.current;
        const p = Math.min(1, elapsedRef.current / 5000);
        setProgress(p);
        if (p >= 1) { next(); return; }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    startRef.current = performance.now();
    elapsedRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, paused]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  if (!story) return null;

  // Story do tipo "text" tem cor de fundo (gradient/cor) + texto centralizado.
  // Story do tipo "image" tem url da imagem.
  // Story de outro usuário (legado) usa o avatar como fundo de fallback.
  const isText = story.type === 'text';
  const isImage = story.type === 'image' && story.image;
  const bgUrl = isImage ? story.image : (story.image || `/api/files/${story.avatar}`);
  const usingAvatarBg = !isText && !isImage;

  function handleDelete(e) {
    e.stopPropagation();
    if (!confirm('Apagar este story?')) return;
    onDelete?.(story, idx);
    if (stories.length <= 1) { onClose?.(); return; }
    if (idx >= stories.length - 1) setIdx(Math.max(0, idx - 1));
    resetProgress();
  }

  async function submitReply(e) {
    e.preventDefault();
    e.stopPropagation();
    const text = replyText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await onReply?.(text, story);
      setReplyText('');
      onClose?.();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.viewer} onClick={onClose}>
      {/* progress bars no topo, uma por story */}
      <div className={styles.progress}>
        {stories.map((_, i) => (
          <div key={i} className={styles.bar}>
            <div
              className={styles.fill}
              style={{ width: i < idx ? '100%' : i === idx ? `${progress * 100}%` : '0%' }}
            />
          </div>
        ))}
      </div>

      {/* header com avatar + nome + (delete) + close */}
      <div className={styles.head} onClick={(e) => e.stopPropagation()}>
        <Avatar name={story.name || 'Você'} src={story.avatar} size={36} />
        <div className={styles.headInfo}>
          <strong>{story.name || 'Você'}</strong>
          {story.time ? <span className={styles.headTime}>{story.time}</span> : null}
        </div>
        {mine ? (
          <button type="button" className={styles.closeBtn} onClick={handleDelete} aria-label="Apagar story" title="Apagar story">
            <TrashIcon size={18} />
          </button>
        ) : null}
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
          <XIcon size={20} />
        </button>
      </div>

      {/* corpo (tap esquerdo=prev, direito=next, hold=pause) */}
      <div
        className={styles.body}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
        onClick={(e) => e.stopPropagation()}
      >
        <button className={styles.prev} onClick={prev} aria-label="Anterior">
          <ArrowLeftIcon size={28} />
        </button>
        <div
          className={styles.content}
          style={isText
            ? { background: story.bg || `linear-gradient(135deg, var(--accent), var(--accent-strong))` }
            : isImage
              ? { backgroundImage: `url(${bgUrl})` }
              : { background: `linear-gradient(135deg, var(--accent), var(--accent-strong))` }
          }
        >
          {isText ? (
            <div className={styles.textStory}>{story.text}</div>
          ) : usingAvatarBg ? (
            <div className={styles.fallback}>
              <Avatar name={story.name} src={story.avatar} size={120} />
              <div className={styles.fallbackName}>{story.name}</div>
              <div className={styles.fallbackMsg}>Compartilhou um story 📸</div>
            </div>
          ) : null}
        </div>
        <button className={styles.next} onClick={next} aria-label="Próximo">
          <ChevronRightIcon size={28} />
        </button>
      </div>

      {/* Reply input — apenas em stories de outros (não em mine) */}
      {!mine && onReply ? (
        <form className={styles.replyBar} onClick={(e) => e.stopPropagation()} onSubmit={submitReply}>
          <input
            className={styles.replyInput}
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={`Responder ao story de ${story.name?.split(' ')[0] || 'contato'}…`}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            aria-label="Responder ao story"
          />
          <button
            type="submit"
            className={styles.replySend}
            disabled={!replyText.trim() || sending}
            aria-label="Enviar resposta"
          >
            <SendIcon size={18} />
          </button>
        </form>
      ) : null}
    </div>
  );
}
