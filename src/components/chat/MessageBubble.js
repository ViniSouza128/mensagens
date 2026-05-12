'use client';
import { memo, useEffect, useRef, useState } from 'react';
import Avatar from '@/components/ui/Avatar';
import MessageStatus from './MessageStatus';
import ReplyPreview from './ReplyPreview';
import LinkPreview from './LinkPreview';
import ReactionsBar from './ReactionsBar';
import MessageMenu from './MessageMenu';
import AudioPlayer from './AudioPlayer';
import VoiceMessage from './VoiceMessage';
import FilePreview from './FilePreview';
import PollMessage from './PollMessage';
import MessageChevronMenu from './MessageChevronMenu';
import MessageReactButton from './MessageReactButton';
import { formatTime } from '@/lib/time';
import { sanitizeHref } from '@/lib/url';
import { formatBytes } from '@/lib/format';
import {
  StarIcon, CheckIcon, XIcon,
} from '@/components/icons/Icons';
import styles from './MessageBubble.module.css';

const EDIT_WINDOW_MS = 4 * 60 * 60 * 1000;
const LONG_PRESS_MS = 450;

// ─── Concurrent image load limiter ─────────────────────────────────────────
let _activeLoads = 0;
const _loadQueue = [];
const MAX_IMG_LOADS = 4;

function _runLoad(fn) {
  _activeLoads++;
  fn().finally(() => {
    _activeLoads--;
    if (_loadQueue.length) _runLoad(_loadQueue.shift());
  });
}

function scheduleImageLoad(fn) {
  if (_activeLoads < MAX_IMG_LOADS) _runLoad(fn);
  else _loadQueue.push(fn);
}

// ─── Component ───────────────────────────────────────────────────────────────

function MessageBubble({
  msg, me, chat, prevMsg, nextMsg, groupFirst = true, groupLast = true,
  isPinned, selectionMode, selected, highlighted,
  onReply, onEdit, onDelete, onReact, onStar, onPin, onForward,
  onRetry, onDetails, onOpenPreview, onReport, onToggleSelect, onStartSelection,
}) {
  const isMine = msg.sender_id === me?.id;
  const showAvatar = chat.type === 'group' && !isMine && groupLast;
  const showAuthor = chat.type === 'group' && !isMine && groupFirst;
  const [contextMenu, setContextMenu] = useState(null); // { x, y }
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(msg.body || '');
  const ref = useRef(null);
  const longPressTimer = useRef(null);
  const editRef = useRef(null);
  const swipeRef = useRef(null);
  const [swipeX, setSwipeX] = useState(0);

  const canEdit = isMine && !msg.deleted && (msg.type === 'text') &&
    ((Date.now() - (msg.created_at || 0)) < EDIT_WINDOW_MS || (msg.status !== 'read'));

  function copyText() {
    if (msg.body) navigator.clipboard?.writeText(msg.body).catch(() => {});
  }

  function handleClick(e) {
    if (selectionMode) onToggleSelect?.(msg);
  }

  function handleContextMenu(e) {
    if (msg.deleted || msg.status === 'failed') return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }

  function startLongPress(e) {
    if (msg.deleted || msg.status === 'failed' || selectionMode) return;
    if (e.touches?.length !== 1) return;
    const t = e.touches[0];
    swipeRef.current = { startX: t.clientX, startY: t.clientY, dx: 0, dy: 0, moved: false };
    longPressTimer.current = setTimeout(() => {
      if (swipeRef.current && !swipeRef.current.moved) {
        setContextMenu({ x: t.clientX, y: t.clientY, fromTouch: true });
      }
    }, LONG_PRESS_MS);
  }
  function moveLongPress(e) {
    const s = swipeRef.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.startX;
    const dy = t.clientY - s.startY;
    s.dx = dx; s.dy = dy;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      s.moved = true;
      clearTimeout(longPressTimer.current);
    }
    // Swipe horizontal predominante e na direção "natural" (esquerda para minhas, direita para outras)
    const dirOk = (isMine && dx < 0) || (!isMine && dx > 0);
    if (dirOk && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setSwipeX(Math.max(Math.min(dx, 80), -80));
    }
  }
  function cancelLongPress() {
    clearTimeout(longPressTimer.current);
    const s = swipeRef.current;
    if (s && Math.abs(s.dx) > 60 && !msg.deleted) {
      onReply?.(msg);
    }
    setSwipeX(0);
    swipeRef.current = null;
  }

  // Inline edit ──────────────────────────────────────────────────────────────
  function startEdit() {
    setEditing(true);
    setEditValue(msg.body || '');
    setContextMenu(null);
    setTimeout(() => {
      const el = editRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 0);
  }
  function cancelEdit() { setEditing(false); }
  function commitEdit() {
    const v = editValue.trim();
    if (!v || v === msg.body) { setEditing(false); return; }
    // Reaproveita o mesmo handler que abre o composer no modo edição,
    // mas dispara o save direto pelo onEdit callback do parent.
    onEdit?.(msg, v);
    setEditing(false);
  }
  function onEditKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  }

  return (
    <div
      className={[
        styles.row,
        isMine ? styles.right : styles.left,
        selected ? styles.selected : '',
        selectionMode ? styles.selecting : '',
        highlighted ? styles.highlighted : '',
        groupFirst ? styles.groupFirst : '',
        groupLast ? styles.groupLast : '',
      ].join(' ')}
      data-msg-id={msg.id}
      data-msg-ts={msg.created_at || ''}
      ref={ref}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchMove={moveLongPress}
      onTouchCancel={cancelLongPress}
      style={swipeX ? { transform: `translateX(${swipeX}px)`, transition: 'none' } : undefined}
    >
      {selectionMode ? (
        <span className={[styles.checkbox, selected ? styles.checked : ''].join(' ')} aria-hidden />
      ) : null}

      {chat.type === 'group' && !isMine ? (
        showAvatar
          ? <div className={styles.avatar}><Avatar name={msg.sender_name || '?'} src={msg.sender_avatar} size={28} /></div>
          : <div className={styles.avatarSpacer} />
      ) : null}

      {/* Smile (reagir) — vive na linha (.row) ao lado da bolha. Para mine
          fica à ESQUERDA da bolha (renderizado antes); para theirs fica à
          DIREITA (renderizado depois). Sempre fora da bolha. */}
      {isMine && !selectionMode && msg.status !== 'failed' && !msg.deleted && !editing ? (
        <span className={styles.reactSlot}>
          <MessageReactButton
            isMine
            onPick={(em) => onReact?.(msg, em)}
          />
        </span>
      ) : null}

      <div className={styles.bubbleWrap}>
        {showAuthor ? <div className={styles.author}>{msg.sender_name || ''}</div> : null}

        <div className={[
          styles.bubble,
          isMine ? styles.mine : styles.theirs,
          msg.status === 'failed' ? styles.failed : '',
          groupFirst && groupLast ? styles.solo : '',
          !groupFirst && !groupLast ? styles.middle : '',
          groupFirst && !groupLast ? styles.first : '',
          !groupFirst && groupLast ? styles.last : '',
          msg.type === 'sticker' ? styles.bubbleSticker : '',
        ].join(' ')}>
          {msg.reply_to ? (
            <div className={styles.replyWrap}>
              <ReplyPreview reply={msg.reply_to} />
            </div>
          ) : null}

          <Body msg={msg} onOpenPreview={onOpenPreview} isMine={isMine} />

          {/* Chevron de opções (clone WhatsApp Web) — só ações, sem reações.
              Aparece no canto sup. dir. da bolha apenas no hover. */}
          {!selectionMode && msg.status !== 'failed' && !msg.deleted && !editing ? (
            <MessageChevronMenu
              msg={msg}
              isMine={isMine}
              isPinned={isPinned}
              canEdit={canEdit}
              onReply={onReply}
              onForward={onForward}
              onStar={onStar}
              onPin={onPin}
              onEdit={() => startEdit()}
              onDelete={onDelete}
              onReport={onReport}
              onDetails={onDetails}
              onCopy={copyText}
              onSelect={onStartSelection}
            />
          ) : null}

          {editing ? (
            <div className={styles.editBox}>
              <textarea
                ref={editRef}
                className={styles.editArea}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={onEditKey}
                rows={Math.min(6, Math.max(1, editValue.split('\n').length))}
                aria-label="Editar mensagem"
              />
              <div className={styles.editActions}>
                <button type="button" className={styles.editBtn} onClick={cancelEdit} aria-label="Cancelar"><XIcon size={14} /></button>
                <button type="button" className={[styles.editBtn, styles.editBtnPrimary].join(' ')} onClick={commitEdit} aria-label="Salvar"><CheckIcon size={14} /></button>
              </div>
            </div>
          ) : (msg.body && msg.type !== 'sticker' && msg.type !== 'gif') ? <TextWithLinks text={msg.body} /> : null}

          {!editing ? (
            <div className={styles.meta}>
              {msg.edited_at ? <span className={styles.edited}>editada</span> : null}
              <span className={styles.time}>{formatTime(msg.created_at)}</span>
              {isMine ? <MessageStatus status={msg.status} /> : null}
            </div>
          ) : null}

          {msg.starred ? <StarIcon size={12} className={styles.starBadge} /> : null}

          {msg.status === 'failed' ? (
            <button type="button" className={styles.retry} onClick={() => onRetry?.(msg)}>Tentar novamente</button>
          ) : null}
        </div>

        <ReactionsBar reactions={msg.reactions} me={me} onReact={(emoji) => onReact?.(msg, emoji)} />
      </div>

      {!isMine && !selectionMode && msg.status !== 'failed' && !msg.deleted && !editing ? (
        <span className={styles.reactSlot}>
          <MessageReactButton
            isMine={false}
            onPick={(em) => onReact?.(msg, em)}
          />
        </span>
      ) : null}

      {contextMenu ? (
        <ContextMenuPortal
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        >
          <MessageMenu
            inline
            msg={msg}
            isMine={isMine}
            isPinned={isPinned}
            canEdit={canEdit}
            onReply={() => { setContextMenu(null); onReply?.(msg); }}
            onForward={() => { setContextMenu(null); onForward?.(msg); }}
            onStar={() => { setContextMenu(null); onStar?.(msg, !msg.starred); }}
            onPin={() => { setContextMenu(null); onPin?.(msg, !isPinned); }}
            onEdit={() => { setContextMenu(null); startEdit(); }}
            onDelete={() => { setContextMenu(null); onDelete?.(msg); }}
            onReport={() => { setContextMenu(null); onReport?.(msg); }}
            onDetails={() => { setContextMenu(null); onDetails?.(msg); }}
            onCopy={() => { setContextMenu(null); copyText(); }}
            onSelect={() => { setContextMenu(null); onStartSelection?.(msg); }}
          />
        </ContextMenuPortal>
      ) : null}
    </div>
  );
}

function ContextMenuPortal({ x, y, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) onClose?.(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Mantém dentro da janela
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const left = Math.min(x, vw - 220);
  const top = Math.min(y, vh - 280);

  return (
    <div
      ref={ref}
      className={styles.contextWrap}
      style={{ left, top }}
      role="menu"
    >
      {children}
    </div>
  );
}

export default memo(MessageBubble, (prev, next) => {
  return (
    prev.msg === next.msg &&
    prev.isPinned === next.isPinned &&
    prev.selected === next.selected &&
    prev.highlighted === next.highlighted &&
    prev.selectionMode === next.selectionMode &&
    prev.me === next.me &&
    prev.chat === next.chat &&
    prev.prevMsg === next.prevMsg &&
    prev.nextMsg === next.nextMsg &&
    prev.groupFirst === next.groupFirst &&
    prev.groupLast === next.groupLast &&
    prev.onReply === next.onReply &&
    prev.onEdit === next.onEdit &&
    prev.onDelete === next.onDelete &&
    prev.onReact === next.onReact &&
    prev.onStar === next.onStar &&
    prev.onPin === next.onPin &&
    prev.onForward === next.onForward &&
    prev.onRetry === next.onRetry &&
    prev.onDetails === next.onDetails &&
    prev.onOpenPreview === next.onOpenPreview &&
    prev.onReport === next.onReport &&
    prev.onToggleSelect === next.onToggleSelect &&
    prev.onStartSelection === next.onStartSelection
  );
});

// ─── Progressive image component ────────────────────────────────────────────

function ProgressiveImage({ thumbSrc, fullSrc, alt, className, onClick }) {
  const [src, setSrc] = useState(thumbSrc || fullSrc);
  const [isThumb, setIsThumb] = useState(!!(thumbSrc && fullSrc && thumbSrc !== fullSrc));

  useEffect(() => {
    if (!thumbSrc || !fullSrc || thumbSrc === fullSrc) return;
    const conn = typeof navigator !== 'undefined' ? navigator.connection : null;
    if (conn?.saveData || conn?.effectiveType === '2g') return;

    setSrc(thumbSrc);
    setIsThumb(true);

    let cancelled = false;
    scheduleImageLoad(() => new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        if (!cancelled) { setSrc(fullSrc); setIsThumb(false); }
        resolve();
      };
      img.onerror = resolve;
      img.src = fullSrc;
    }));

    return () => { cancelled = true; };
  }, [thumbSrc, fullSrc]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={[className, isThumb ? styles.imgBlur : styles.imgSharp].join(' ')}
      loading="lazy"
      decoding="async"
      onClick={onClick}
    />
  );
}

function LazyVideo({ src, poster, mime }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className={styles.videoWrap} ref={ref}>
      <video
        controls
        preload={inView ? 'metadata' : 'none'}
        poster={poster || undefined}
        className={styles.video}
      >
        <source src={src} type={mime || 'video/mp4'} />
      </video>
    </div>
  );
}

function Body({ msg, onOpenPreview, isMine }) {
  if (msg.deleted) return <div className={styles.deleted}>Esta mensagem foi apagada</div>;

  // ─── Sticker: PNG (Twemoji) renderizado grande sem balão ───
  if (msg.type === 'sticker' && msg.body) {
    const isUrl = /^https?:\/\//.test(msg.body);
    return (
      <div className={styles.sticker}>
        {isUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={msg.body} alt="sticker" className={styles.stickerImg} loading="lazy" decoding="async" />
        ) : (
          <span>{msg.body}</span>
        )}
      </div>
    );
  }

  // ─── GIF externo (Tenor): URL no body ───
  if (msg.type === 'gif' && msg.body) {
    return (
      <div className={styles.imgWrap} onClick={() => onOpenPreview?.({ kind: 'gif', src: msg.body, name: 'gif', view: true })}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={msg.body} alt="GIF" className={styles.image} loading="lazy" decoding="async" />
        <span className={styles.gifBadge} aria-hidden>GIF</span>
      </div>
    );
  }

  // ─── Tipos especiais (poll, voice) detectados via msg.type ───
  if (msg.type === 'poll' && msg.poll) {
    return (
      <PollMessage
        question={msg.poll.question}
        options={msg.poll.options}
        total={msg.poll.total}
        multiple={msg.poll.multiple}
        mine={isMine}
      />
    );
  }
  if (msg.type === 'voice') {
    const att = msg.attachments?.[0];
    const src = att ? `/api/files/${att.storage_path}` : null;
    const dur = msg.voice?.duration || (att?.duration_ms ? formatVoiceDuration(att.duration_ms) : '0:00');
    return <VoiceMessage src={src} duration={dur} wave={msg.voice?.wave} mine={isMine} />;
  }

  const att = msg.attachments?.[0];
  if (!att) return null;

  const storageSrc = `/api/files/${att.storage_path}`;
  const thumbSrc = att.thumb_path ? `/api/files/${att.thumb_path}` : storageSrc;

  if (att.kind === 'gif') {
    return (
      <div className={styles.imgWrap} onClick={() => onOpenPreview?.({ kind: 'gif', src: storageSrc, name: att.filename, view: true })}>
        <ProgressiveImage thumbSrc={thumbSrc} fullSrc={storageSrc} alt="GIF" className={styles.image} />
        <span className={styles.gifBadge} aria-hidden>GIF</span>
      </div>
    );
  }
  if (att.kind === 'image') {
    return (
      <div className={styles.imgWrap} onClick={() => onOpenPreview?.({ kind: 'image', src: storageSrc, name: att.filename, view: true })}>
        <ProgressiveImage thumbSrc={thumbSrc} fullSrc={storageSrc} alt={att.filename || 'imagem'} className={styles.image} />
      </div>
    );
  }
  if (att.kind === 'video') {
    const poster = att.poster_path ? `/api/files/${att.poster_path}` : null;
    return <LazyVideo src={storageSrc} poster={poster} mime={att.mime} />;
  }
  if (att.kind === 'audio') {
    // Áudio "tradicional" (música etc.) usa o player original.
    // Para mensagens de voz, use msg.type === 'voice' (acima).
    return <AudioPlayer src={storageSrc} mime={att.mime} durationMs={att.duration_ms} />;
  }
  // Documento — usa novo FilePreview com thumbnail por tipo
  return (
    <FilePreview
      filename={att.filename}
      size={att.size}
      url={`${storageSrc}?download=1`}
      mine={isMine}
    />
  );
}

function formatVoiceDuration(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

// ─── Lightweight markdown + URL renderer ───────────────────────────────────
// Suports: **bold**, _italic_, ~~strike~~, `inline code`, > quote (line),
// auto-links, line breaks. No HTML escaping needed since we only render text
// nodes through React; only URL hrefs are sanitized.

function TextWithLinks({ text }) {
  if (!text) return null;
  let firstHref = null;
  const lines = text.split(/\r?\n/);

  const elems = [];
  lines.forEach((line, li) => {
    if (li > 0) elems.push(<br key={`br-${li}`} />);
    if (/^\s*>\s?/.test(line)) {
      const inner = line.replace(/^\s*>\s?/, '');
      elems.push(
        <span key={`q-${li}`} className={styles.quote}>{renderInline(inner, (h) => { if (!firstHref) firstHref = h; })}</span>
      );
    } else {
      elems.push(<span key={`l-${li}`}>{renderInline(line, (h) => { if (!firstHref) firstHref = h; })}</span>);
    }
  });

  return (
    <>
      <div className={styles.text}>{elems}</div>
      {firstHref ? <LinkPreview url={firstHref} /> : null}
    </>
  );
}

function renderInline(text, captureHref) {
  // Tokenize matching a small set of patterns.
  const re = /(\*\*[^*\n]+\*\*|_[^_\n]+_|~~[^~\n]+~~|`[^`\n]+`|(?:https?:\/\/|www\.)[^\s<>"']+)/g;
  const out = [];
  let cursor = 0;
  let m;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) out.push(text.slice(cursor, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      out.push(<strong key={`b-${key++}`}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('_')) {
      out.push(<em key={`i-${key++}`}>{tok.slice(1, -1)}</em>);
    } else if (tok.startsWith('~~')) {
      out.push(<s key={`s-${key++}`}>{tok.slice(2, -2)}</s>);
    } else if (tok.startsWith('`')) {
      out.push(<code key={`c-${key++}`} className={styles.codeInline}>{tok.slice(1, -1)}</code>);
    } else {
      let href = tok;
      if (href.startsWith('www.')) href = 'http://' + href;
      const safe = sanitizeHref(href);
      if (safe) {
        captureHref?.(safe);
        out.push(<a key={`a-${key++}`} href={safe} target="_blank" rel="noopener noreferrer">{tok}</a>);
      } else {
        out.push(tok);
      }
    }
    cursor = m.index + tok.length;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}
