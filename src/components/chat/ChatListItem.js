'use client';
import { memo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Avatar from '@/components/ui/Avatar';
import { formatRelative } from '@/lib/time';
import { truncate } from '@/lib/format';
import {
  PinIcon, BellOffIcon, BellIcon, ImageIcon, VideoIcon, FileIcon, MicIcon, ArchiveIcon,
} from '@/components/icons/Icons';
import { useApp } from '@/store/AppStateProvider';
import { api } from '@/services/api';
import styles from './ChatListItem.module.css';

// Cache simples para evitar prefetches duplicados. Vive o ciclo da página.
const _prefetched = new Set();
function prefetchChatData(chatId) {
  if (_prefetched.has(chatId)) return;
  _prefetched.add(chatId);
  // Dispara em paralelo, ignorando erros — apenas aquecemos cache do navegador
  // e do localStorage. Quando o usuário clicar, a navegação já encontra hits.
  api.get(`/api/chats/${chatId}`).catch(() => {});
  api.get(`/api/chats/${chatId}/messages`).then((data) => {
    if (typeof window === 'undefined') return;
    try {
      const trimmed = (Array.isArray(data) ? data : []).slice(-40);
      window.localStorage.setItem(`mensagens.cache.msgs.${chatId}`, JSON.stringify(trimmed));
    } catch {}
  }).catch(() => {});
}

function previewIcon(type) {
  switch (type) {
    case 'image': return <ImageIcon size={14} />;
    case 'video': return <VideoIcon size={14} />;
    case 'audio': return <MicIcon size={14} />;
    case 'gif': return <ImageIcon size={14} />;
    case 'document': return <FileIcon size={14} />;
    default: return null;
  }
}

function typeLabel(type) {
  switch (type) {
    case 'image': return 'Foto';
    case 'video': return 'Vídeo';
    case 'audio': return 'Áudio';
    case 'gif': return 'GIF';
    case 'document': return 'Arquivo';
    default: return null;
  }
}

function ChatListItem({ chat, active }) {
  const { user, refreshChats } = useApp();
  const router = useRouter();
  const last = chat.last_message;
  const draft = chat.draft;
  const swipeRef = useRef(null);
  const [swipeX, setSwipeX] = useState(0);
  const [actionRevealed, setActionRevealed] = useState(false);

  let preview = null;
  if (draft) {
    preview = <><span className={styles.draftTag}>Rascunho:</span> {truncate(draft, 60)}</>;
  } else if (last) {
    if (last.deleted) preview = <em className="faint">Mensagem apagada</em>;
    else if (last.type === 'text') {
      const prefix = chat.type === 'group' && last.sender_id !== user?.id && last.sender_name ? `${last.sender_name.split(' ')[0]}: ` : '';
      preview = <>{prefix}{truncate(last.body || '', 60)}</>;
    } else {
      preview = (
        <span className={styles.iconRow}>
          {previewIcon(last.type)} {typeLabel(last.type) || ''} {last.body ? `· ${truncate(last.body, 40)}` : ''}
        </span>
      );
    }
  } else {
    preview = <span className="faint">Sem mensagens ainda</span>;
  }

  // ── Swipe actions (mobile) ──
  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    swipeRef.current = { x: e.touches[0].clientX, dx: 0 };
  }
  function onTouchMove(e) {
    if (!swipeRef.current) return;
    const dx = e.touches[0].clientX - swipeRef.current.x;
    swipeRef.current.dx = dx;
    if (dx < 0) setSwipeX(Math.max(dx, -160)); // só esquerda revela
  }
  function onTouchEnd() {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s) return;
    if (s.dx < -80) { setSwipeX(-160); setActionRevealed(true); }
    else { setSwipeX(0); setActionRevealed(false); }
  }
  function closeActions() { setSwipeX(0); setActionRevealed(false); }

  async function togglePin() {
    closeActions();
    try { await api.patch(`/api/chats/${chat.id}`, { pinned: !chat.pinned }); refreshChats(); } catch {}
  }
  async function toggleMute() {
    closeActions();
    try { await api.patch(`/api/chats/${chat.id}`, { muted: !chat.muted }); refreshChats(); } catch {}
  }
  async function archive() {
    closeActions();
    try { await api.patch(`/api/chats/${chat.id}`, { archived: 1 }); refreshChats(); } catch {}
  }

  function go(e) {
    if (actionRevealed) { e.preventDefault(); closeActions(); return; }
    router.push(`/chats/${chat.id}`);
  }

  return (
    <div className={styles.swipeWrap}>
      <div className={styles.actionLayer}>
        <button type="button" className={[styles.action, styles.actionPin].join(' ')} onClick={togglePin} aria-label={chat.pinned ? 'Desafixar' : 'Fixar'}>
          <PinIcon size={16} />
        </button>
        <button type="button" className={[styles.action, styles.actionMute].join(' ')} onClick={toggleMute} aria-label={chat.muted ? 'Reativar som' : 'Silenciar'}>
          {chat.muted ? <BellIcon size={16} /> : <BellOffIcon size={16} />}
        </button>
        <button type="button" className={[styles.action, styles.actionArchive].join(' ')} onClick={archive} aria-label="Arquivar">
          <ArchiveIcon size={16} />
        </button>
      </div>
      <Link
        href={`/chats/${chat.id}`}
        prefetch
        className={[styles.item, active ? styles.active : ''].join(' ')}
        role="listitem"
        onClick={go}
        onMouseEnter={() => prefetchChatData(chat.id)}
        onFocus={() => prefetchChatData(chat.id)}
        onTouchStart={(e) => { prefetchChatData(chat.id); onTouchStart(e); }}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={swipeX ? { transform: `translateX(${swipeX}px)` } : undefined}
      >
        <Avatar name={chat.name || 'Conversa'} src={chat.avatar_path} size={48} online={chat.partner?.online} />
        <div className={styles.body}>
          <div className={styles.row1}>
            <span className={[styles.name, 'truncate'].join(' ')}>{chat.name || 'Conversa'}</span>
            {chat.partner?.is_bot ? (
              <span className={styles.botBadge} title={`Bot AI · ${chat.partner.bot_model || 'modelo local'}`}>AI</span>
            ) : null}
            <span className={styles.time}>{formatRelative(chat.last_message_at)}</span>
          </div>
          <div className={styles.row2}>
            <span className={[styles.preview, 'truncate'].join(' ')}>
              {chat.partner?.typing ? <em className={styles.typing}>digitando…</em> : preview}
            </span>
            <span className={styles.meta}>
              {chat.muted ? <span className={styles.metaIcon} title="Silenciado"><BellOffIcon size={14} /></span> : null}
              {chat.pinned ? <span className={styles.metaIcon} title="Fixado"><PinIcon size={14} /></span> : null}
              {chat.has_mention && !active ? <span className={styles.mentionMark} title="Você foi mencionado">@</span> : null}
              {!active && chat.unread > 0 ? <span className={styles.unread}>{chat.unread > 99 ? '99+' : chat.unread}</span> : null}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}

export default memo(ChatListItem);
