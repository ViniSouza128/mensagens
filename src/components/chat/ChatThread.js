'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import EmptyChat from './EmptyChat';
import { ThreadSkeleton } from '@/components/ui/Skeleton';
import { ChevronDownIcon } from '@/components/icons/Icons';
import { formatDateLabel, isSameDay } from '@/lib/time';
import styles from './ChatThread.module.css';

// 5min — within this window, consecutive messages from same sender are grouped
const GROUP_WINDOW_MS = 5 * 60 * 1000;

export default function ChatThread({
  chat, me, messages, hasMore, onLoadMore, loading, typing,
  onReply, onEdit, onDelete, onReact, onStar, onPin, onForward, onRetry, onDetails, onOpenPreview, onReport,
  selectionMode, selected, onToggleSelect, onStartSelection,
  highlightedMsgId,
}) {
  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);
  const lastIdRef = useRef(null);
  const stickToBottom = useRef(true);
  const [stickyDate, setStickyDate] = useState(null);
  const [unread, setUnread] = useState(0);

  const pinnedSet = useMemo(() => new Set(chat.pinned || []), [chat.pinned]);
  const items = useMemo(() => buildItems(messages), [messages]);

  // Observe sentinel at top for loading more messages
  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && hasMore) onLoadMore?.();
      }
    }, { root: scrollRef.current, threshold: 0.1 });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, onLoadMore]);

  // Auto-scroll: on first load, restore previous scroll position (if any)
  // OR jump to bottom. On new messages, only scroll if user was at bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    if (!last) return;
    const isNew = last.id !== lastIdRef.current;
    const wasFirst = lastIdRef.current === null;
    lastIdRef.current = last.id;
    if (!isNew) return;
    if (wasFirst) {
      // tenta restaurar
      try {
        const key = `mensagens.scroll.${chat?.id || ''}`;
        const stored = sessionStorage.getItem(key);
        if (stored) {
          const top = parseInt(stored, 10);
          if (!Number.isNaN(top) && top > 0 && top < el.scrollHeight) {
            el.scrollTop = top;
            stickToBottom.current = el.scrollHeight - (top + el.clientHeight) < 80;
            setUnread(0);
            return;
          }
        }
      } catch {}
      el.scrollTop = el.scrollHeight;
      setUnread(0);
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
      setUnread(0);
    } else if (last.sender_id !== me?.id) {
      setUnread((u) => u + 1);
    }
  }, [messages, me, chat?.id]);

  // Save scroll position on unmount / chat change
  useEffect(() => {
    return () => {
      try {
        const el = scrollRef.current;
        if (!el || !chat?.id) return;
        sessionStorage.setItem(`mensagens.scroll.${chat.id}`, String(el.scrollTop));
      } catch {}
    };
  }, [chat?.id]);

  // Detect if user is near the bottom for auto-scroll + clear unread badge there
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    const wasStuck = stickToBottom.current;
    stickToBottom.current = distance < 80;
    if (!wasStuck && stickToBottom.current) setUnread(0);
    updateStickyDate();
  }

  // Sticky date label: pick the date of the topmost visible message
  const updateStickyDate = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop + 8;
    const nodes = el.querySelectorAll('[data-msg-ts]');
    let lastBefore = null;
    for (const n of nodes) {
      const off = n.offsetTop;
      if (off <= top + 40) lastBefore = n;
      else break;
    }
    if (lastBefore) {
      const ts = Number(lastBefore.getAttribute('data-msg-ts'));
      setStickyDate(formatDateLabel(ts));
    } else {
      setStickyDate(null);
    }
  }, []);

  useEffect(() => { updateStickyDate(); }, [items, updateStickyDate]);

  // Scroll to and highlight a specific message when highlightedMsgId changes
  useEffect(() => {
    if (!highlightedMsgId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-msg-id="${highlightedMsgId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedMsgId]);

  function jumpToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    stickToBottom.current = true;
    setUnread(0);
  }

  if (loading && messages.length === 0) {
    return (
      <div className={styles.scroll} ref={scrollRef}>
        <ThreadSkeleton count={6} />
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {stickyDate ? (
        <div className={styles.stickyDate} aria-hidden="true">
          <span>{stickyDate}</span>
        </div>
      ) : null}

      <div
        className={styles.scroll}
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label="Mensagens"
      >
        <div ref={sentinelRef} className={styles.sentinel} aria-hidden />
        {items.map((it, i) => {
          if (it.type === 'date') {
            return <div key={`d-${i}`} className={styles.dateChip}><span>{it.label}</span></div>;
          }
          const m = it.msg;
          return (
            <MessageBubble
              key={m.id || m.client_id}
              msg={m}
              me={me}
              chat={chat}
              prevMsg={it.prev}
              nextMsg={it.next}
              groupFirst={it.first}
              groupLast={it.last}
              isPinned={pinnedSet.has(m.id)}
              selectionMode={selectionMode}
              selected={selected?.has(m.id)}
              highlighted={m.id === highlightedMsgId}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onReact={onReact}
              onStar={onStar}
              onPin={onPin}
              onForward={onForward}
              onRetry={onRetry}
              onDetails={onDetails}
              onOpenPreview={onOpenPreview}
              onReport={onReport}
              onToggleSelect={onToggleSelect}
              onStartSelection={onStartSelection}
            />
          );
        })}
        {messages.length === 0 && !loading ? (
          <EmptyChat chat={chat} />
        ) : null}
        {typing?.length ? (
          // `typing` agora é uma lista de objetos { name, thinking } (bots LLM
          // mandam `thinking=true` enquanto chamam o Ollama). Aceita strings
          // antigas também — TypingIndicator normaliza.
          <TypingIndicator entries={typing} />
        ) : null}
      </div>

      {(unread > 0 || !stickToBottom.current) ? (
        <button
          type="button"
          className={[styles.scrollBtn, unread > 0 ? styles.scrollBtnUnread : ''].join(' ')}
          onClick={jumpToBottom}
          aria-label={unread > 0 ? `${unread} novas mensagens — ir para o fim` : 'Ir para o fim'}
        >
          <ChevronDownIcon size={20} />
          {unread > 0 ? <span className={styles.scrollBtnBadge}>{unread > 99 ? '99+' : unread}</span> : null}
        </button>
      ) : null}
    </div>
  );
}

// Build items with grouping flags. Each msg item knows whether it's the
// first/last in a same-sender visual group (group window = 5min).
function buildItems(allMessages) {
  // Hide messages flagged for pending optimistic delete (undo window)
  const messages = allMessages.filter((m) => !m._pendingDelete);
  const out = [];
  let lastDay = null;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const d = new Date(m.created_at || Date.now());
    if (!lastDay || !isSameDay(lastDay, d)) {
      out.push({ type: 'date', label: formatDateLabel(m.created_at || Date.now()) });
      lastDay = d;
    }
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const sameSenderPrev = prev
      && prev.sender_id === m.sender_id
      && isSameDay(new Date(prev.created_at || 0), d)
      && (m.created_at - prev.created_at) < GROUP_WINDOW_MS
      && !prev.deleted && !m.deleted;
    const sameSenderNext = next
      && next.sender_id === m.sender_id
      && isSameDay(new Date(next.created_at || 0), d)
      && (next.created_at - m.created_at) < GROUP_WINDOW_MS
      && !next.deleted && !m.deleted;
    out.push({
      type: 'msg',
      msg: m,
      prev: prev || null,
      next: next || null,
      first: !sameSenderPrev,
      last: !sameSenderNext,
    });
  }
  return out;
}
