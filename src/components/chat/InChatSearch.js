'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/services/api';
import Avatar from '@/components/ui/Avatar';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import { parseSnippet } from '@/lib/searchQuery';
import { formatRelative } from '@/lib/time';
import { SearchIcon, XIcon, ChevronUpIcon, ChevronDownIcon } from '@/components/icons/Icons';
import styles from './InChatSearch.module.css';

const LIMIT = 20;

/**
 * In-chat search panel.
 *
 * Props:
 *   chatId     — current chat ID
 *   onGoTo(id) — scroll + highlight a message in the thread
 *   onClose()  — close the search panel
 */
export default function InChatSearch({ chatId, onGoTo, onClose }) {
  const [q, setQ] = useState('');
  const dq = useDebouncedValue(q, 300);
  const [results, setResults] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  // Index of the keyboard-selected result
  const [cursor, setCursor] = useState(-1);
  // sender_id to filter by, null = all
  const [senderFilter, setSenderFilter] = useState(null);
  const inputRef = useRef(null);
  // Array of result DOM refs for scroll-into-view
  const resultRefs = useRef([]);

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Reset when query changes
  useEffect(() => {
    setResults([]);
    setOffset(0);
    setCursor(-1);
    setHasMore(false);
    setSenderFilter(null);
  }, [dq]);

  // Fetch results — AbortController cancels the in-flight request when
  // the query changes, preventing stale results from overwriting newer ones.
  useEffect(() => {
    if (!dq || !chatId) { setResults([]); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    api.get(`/api/search?chat_id=${chatId}&q=${encodeURIComponent(dq)}&limit=${LIMIT}`, { signal: controller.signal })
      .then((r) => {
        setResults(r?.results || []);
        setHasMore(r?.hasMore || false);
      })
      .catch((err) => { if (err?.name === 'AbortError') return; /* ignore cancelled */ })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [dq, chatId]);

  // Load more
  async function loadMore() {
    const newOffset = offset + LIMIT;
    try {
      const r = await api.get(
        `/api/search?chat_id=${chatId}&q=${encodeURIComponent(dq)}&limit=${LIMIT}&offset=${newOffset}`
      );
      setResults((prev) => [...prev, ...(r?.results || [])]);
      setHasMore(r?.hasMore || false);
      setOffset(newOffset);
    } catch { /* noop */ }
  }

  // Unique senders in the result set — drives the sender filter dropdown
  const uniqueSenders = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const r of results) {
      if (!seen.has(r.sender_id)) {
        seen.add(r.sender_id);
        list.push({ id: r.sender_id, name: r.sender_name, avatar: r.sender_avatar });
      }
    }
    return list;
  }, [results]);

  // Apply sender filter on the client side (no extra network request)
  const filteredResults = senderFilter
    ? results.filter((r) => r.sender_id === senderFilter)
    : results;

  // Scroll the focused result into view inside the panel whenever cursor moves
  useEffect(() => {
    if (cursor >= 0 && resultRefs.current[cursor]) {
      resultRefs.current[cursor].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [cursor]);

  // Jump to a result in the message thread
  function goTo(id) { onGoTo?.(id); }

  /**
   * Move cursor by delta and immediately navigate to that result.
   * Used by the ⬆/⬇ buttons in the bar.
   */
  function moveCursor(delta) {
    const next = Math.max(0, Math.min(cursor + delta, filteredResults.length - 1));
    setCursor(next);
    if (filteredResults[next]) goTo(filteredResults[next].id);
  }

  // Keyboard handler on the input field
  function handleKey(e) {
    if (e.key === 'Escape') { onClose?.(); return; }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(cursor + 1, filteredResults.length - 1);
      setCursor(next);
      if (filteredResults[next]) goTo(filteredResults[next].id);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(cursor - 1, 0);
      setCursor(next);
      if (filteredResults[next]) goTo(filteredResults[next].id);
    } else if (e.key === 'Enter') {
      // Navigate to currently selected, or the first result
      const target = cursor >= 0 ? filteredResults[cursor] : filteredResults[0];
      if (target) {
        setCursor(cursor >= 0 ? cursor : 0);
        goTo(target.id);
      }
    }
  }

  const empty = !loading && dq && filteredResults.length === 0;
  const total = filteredResults.length;

  return (
    <div className={styles.panel} role="search" aria-label="Buscar nesta conversa">

      {/* ── Input + navigation bar ──────────────────────────────────── */}
      <div className={styles.bar}>
        <span className={styles.barIcon}><SearchIcon size={15} /></span>
        <input
          ref={inputRef}
          type="search"
          className={styles.input}
          placeholder="Buscar nesta conversa…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={handleKey}
          aria-label="Buscar mensagens"
        />

        {/* Sender filter — appears when results span multiple senders */}
        {uniqueSenders.length > 1 ? (
          <select
            className={styles.senderSelect}
            value={senderFilter || ''}
            onChange={(e) => { setSenderFilter(e.target.value || null); setCursor(-1); }}
            aria-label="Filtrar por remetente"
          >
            <option value="">Todos</option>
            {uniqueSenders.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        ) : null}

        {/* Prev / next navigation */}
        {total > 0 ? (
          <div className={styles.nav}>
            <span className={styles.count}>
              {cursor >= 0 ? `${cursor + 1} / ${total}` : total}
            </span>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => moveCursor(-1)}
              disabled={cursor <= 0}
              aria-label="Resultado anterior"
            >
              <ChevronUpIcon size={15} />
            </button>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => moveCursor(1)}
              disabled={cursor >= total - 1 && !hasMore}
              aria-label="Próximo resultado"
            >
              <ChevronDownIcon size={15} />
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Fechar busca"
        >
          <XIcon size={15} />
        </button>
      </div>

      {/* ── Results list ─────────────────────────────────────────────── */}
      {(total > 0 || empty) ? (
        <div className={styles.results} role="listbox">
          {empty ? (
            <p className={styles.empty}>Nenhum resultado para "{dq}".</p>
          ) : (
            filteredResults.map((r, i) => (
              <button
                key={r.id}
                ref={(el) => { resultRefs.current[i] = el; }}
                type="button"
                role="option"
                aria-selected={i === cursor}
                className={[styles.result, i === cursor ? styles.focused : ''].join(' ')}
                onClick={() => { setCursor(i); goTo(r.id); }}
              >
                <Avatar name={r.sender_name} src={r.sender_avatar} size={30} />
                <div className={styles.body}>
                  <div className={styles.meta}>
                    <span className={styles.sender}>{r.sender_name}</span>
                    <span className={styles.time}>{formatRelative(r.created_at)}</span>
                  </div>
                  <div className={styles.snippet}>
                    <SnippetText raw={r.snippet || r.body} />
                  </div>
                </div>
              </button>
            ))
          )}
          {/* Only show "load more" when not filtered (filter is client-side) */}
          {hasMore && !senderFilter ? (
            <button type="button" className={styles.loadMore} onClick={loadMore}>
              <ChevronDownIcon size={13} /> Carregar mais resultados
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** XSS-safe: splits <mark>…</mark> into React elements. */
function SnippetText({ raw }) {
  if (!raw) return null;
  return (
    <>
      {parseSnippet(raw).map((p, i) =>
        p.highlight
          ? <mark key={i} className={styles.mark}>{p.text}</mark>
          : <span key={i}>{p.text}</span>
      )}
    </>
  );
}
