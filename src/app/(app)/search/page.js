'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/services/api';
import Avatar from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import { parseSnippet } from '@/lib/searchQuery';
import { formatRelative } from '@/lib/time';
import { formatBytes } from '@/lib/format';
import {
  SearchIcon, ImageIcon, VideoIcon, FileIcon, MicIcon, XIcon, ChevronDownIcon, ClockIcon,
} from '@/components/icons/Icons';
import styles from './search.module.css';

const LIMIT = 10;
const EMPTY_DATA = { users: [], chats: [], messages: [], files: [], hasMore: {} };

export default function SearchPage() {
  const searchParams = useSearchParams();

  // Initialise from URL query param (?q=…) so links and bookmarks work
  const [q, setQ] = useState(() => searchParams.get('q') || '');
  const dq = useDebouncedValue(q, 220);
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [offsets, setOffsets] = useState({ users: 0, chats: 0, messages: 0, files: 0 });
  const inputRef = useRef(null);

  // Search history state
  const [history, setHistory] = useState([]);
  const lastSaved = useRef('');

  // ── Sync query → URL (replaceState avoids polluting browser history) ─────────
  useEffect(() => {
    const url = new URL(window.location.href);
    if (dq) url.searchParams.set('q', dq);
    else url.searchParams.delete('q');
    window.history.replaceState({}, '', url.toString());
  }, [dq]);

  // ── Global keyboard shortcut: Ctrl+K / ⌘K focuses this input ───────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Load recent search history ────────────────────────────────────────────────
  useEffect(() => {
    api.get('/api/search/history')
      .then((r) => setHistory(r?.history || []))
      .catch(() => {});
  }, []);

  // ── Reset pagination when query changes ───────────────────────────────────────
  useEffect(() => {
    setOffsets({ users: 0, chats: 0, messages: 0, files: 0 });
    setData(EMPTY_DATA);
  }, [dq]);

  // ── Fetch search results ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!dq) { setData(EMPTY_DATA); setLoading(false); return; }
    let cancel = false;
    setLoading(true);
    api.get(`/api/search?q=${encodeURIComponent(dq)}&limit=${LIMIT}`)
      .then((r) => { if (!cancel) setData(r || EMPTY_DATA); })
      .catch(() => {})
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [dq]);

  // ── Auto-save to history once non-empty results arrive ───────────────────────
  useEffect(() => {
    if (!dq || dq.length < 2 || loading || lastSaved.current === dq) return;
    const total =
      data.users.length + data.chats.length + data.messages.length + data.files.length;
    if (total === 0) return;
    lastSaved.current = dq;
    api.post('/api/search/history', { query: dq })
      .then(() =>
        setHistory((prev) => [dq, ...prev.filter((h) => h !== dq)].slice(0, 10))
      )
      .catch(() => {});
  }, [dq, loading, data]);

  // ── Load-more pagination per category ────────────────────────────────────────
  const loadMore = useCallback(async (kind) => {
    const newOffset = offsets[kind] + LIMIT;
    try {
      const r = await api.get(
        `/api/search?q=${encodeURIComponent(dq)}&limit=${LIMIT}&offset=${newOffset}`
      );
      if (!r) return;
      setOffsets((prev) => ({ ...prev, [kind]: newOffset }));
      setData((prev) => ({
        ...prev,
        [kind]: [...prev[kind], ...(r[kind] || [])],
        hasMore: { ...prev.hasMore, [kind]: r.hasMore?.[kind] },
      }));
    } catch { /* noop */ }
  }, [dq, offsets]);

  // ── History helpers ───────────────────────────────────────────────────────────
  function applyHistory(item) {
    setQ(item);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function removeHistoryItem(item, e) {
    e.stopPropagation();
    await api.delete(`/api/search/history?q=${encodeURIComponent(item)}`).catch(() => {});
    setHistory((prev) => prev.filter((h) => h !== item));
  }

  async function clearHistory() {
    await api.delete('/api/search/history').catch(() => {});
    setHistory([]);
  }

  const hasResults =
    data.users.length + data.chats.length + data.messages.length + data.files.length > 0;
  const empty = !loading && dq && !hasResults;

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className="h1">Buscar</h1>
        <kbd className={styles.shortcutHint}>Ctrl K</kbd>
      </header>

      {/* ── Search input ─────────────────────────────────────────────────── */}
      <div className={styles.searchBar}>
        <span className={styles.searchIcon}><SearchIcon size={18} /></span>
        <Input
          ref={inputRef}
          placeholder="Pessoas, conversas, mensagens, arquivos…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          aria-label="Busca global"
          style={{ paddingLeft: 38, paddingRight: q ? 36 : undefined }}
        />
        {q ? (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => { setQ(''); inputRef.current?.focus(); }}
            aria-label="Limpar busca"
          >
            <XIcon size={14} />
          </button>
        ) : null}
      </div>

      {/* ── Recent searches (visible when input is empty) ─────────────────── */}
      {!dq && history.length > 0 ? (
        <div className={styles.historySection}>
          <div className={styles.historyHeader}>
            <span className={styles.historyTitle}>
              <ClockIcon size={13} /> Buscas recentes
            </span>
            <button type="button" className={styles.clearAll} onClick={clearHistory}>
              Limpar
            </button>
          </div>
          <div className={styles.chips}>
            {history.map((item) => (
              <button
                key={item}
                type="button"
                className={styles.chip}
                onClick={() => applyHistory(item)}
              >
                <SearchIcon size={12} />
                <span className={styles.chipText}>{item}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className={styles.chipX}
                  aria-label={`Remover "${item}" do histórico`}
                  onClick={(e) => removeHistoryItem(item, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') removeHistoryItem(item, e);
                  }}
                >
                  <XIcon size={11} />
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Status ───────────────────────────────────────────────────────── */}
      {loading ? (
        <p className={styles.hint}>Buscando…</p>
      ) : !dq && history.length === 0 ? (
        <p className={styles.hint}>Digite para buscar em conversas, pessoas e arquivos.</p>
      ) : empty ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>
            Sem resultados para "<strong>{dq}</strong>"
          </p>
          <ul className={styles.emptyTips}>
            <li>Verifique a ortografia</li>
            <li>Tente termos mais curtos ou diferentes</li>
            <li>Use apenas uma palavra-chave por vez</li>
          </ul>
        </div>
      ) : null}

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {hasResults ? (
        <div className={styles.results}>

          {/* PEOPLE */}
          {data.users.length > 0 ? (
            <Section title="Pessoas">
              {data.users.map((u) => (
                <Link key={u.id} href={`/profile/${u.username}`} className={styles.row}>
                  <Avatar name={u.name} src={u.avatar_path} size={38} />
                  <div className={styles.body}>
                    <div className={styles.title}>
                      <Snippet raw={u.name_hl || u.name} />
                    </div>
                    <div className={styles.sub}>
                      @<Snippet raw={u.username_hl || u.username} />
                      {u.bio ? <> · {u.bio}</> : null}
                    </div>
                  </div>
                </Link>
              ))}
              {data.hasMore?.users ? <LoadMore onClick={() => loadMore('users')} /> : null}
            </Section>
          ) : null}

          {/* CHATS */}
          {data.chats.length > 0 ? (
            <Section title="Conversas">
              {data.chats.map((c) => (
                <Link key={c.id} href={`/chats/${c.id}`} className={styles.row}>
                  <Avatar
                    name={c.name || c.partner_name}
                    src={c.avatar_path || c.partner_avatar}
                    size={38}
                  />
                  <div className={styles.body}>
                    <div className={styles.title}>
                      <Snippet raw={c.name_hl || c.name || c.partner_name} />
                    </div>
                    <div className={styles.sub}>
                      {c.type === 'group' ? 'Grupo' : `@${c.partner_username || ''}`}
                    </div>
                  </div>
                </Link>
              ))}
              {data.hasMore?.chats ? <LoadMore onClick={() => loadMore('chats')} /> : null}
            </Section>
          ) : null}

          {/* MESSAGES — link uses #msg-{id} hash so ChatView can jump to it */}
          {data.messages.length > 0 ? (
            <Section title="Mensagens">
              {data.messages.map((m) => (
                <Link
                  key={m.id}
                  href={`/chats/${m.chat_id}#msg-${m.id}`}
                  className={styles.row}
                >
                  <span className={styles.msgIcon}><SearchIcon size={15} /></span>
                  <div className={styles.body}>
                    <div className={styles.msgMeta}>
                      {m.chat_name
                        ? <span className={styles.chatName}>{m.chat_name}</span>
                        : null}
                      {m.sender_name
                        ? <span className={styles.senderName}>{m.sender_name}</span>
                        : null}
                      <span className={styles.msgTime}>{formatRelative(m.created_at)}</span>
                    </div>
                    <div className={styles.snippet}>
                      <Snippet raw={m.snippet || m.body} />
                    </div>
                  </div>
                </Link>
              ))}
              {data.hasMore?.messages ? <LoadMore onClick={() => loadMore('messages')} /> : null}
            </Section>
          ) : null}

          {/* FILES */}
          {data.files.length > 0 ? (
            <Section title="Arquivos">
              {data.files.map((f) => (
                <Link
                  key={f.id}
                  href={`/chats/${f.chat_id}#msg-${f.message_id}`}
                  className={styles.row}
                >
                  <FileThumb f={f} />
                  <div className={styles.body}>
                    <div className={styles.title}>
                      <Snippet raw={f.filename_hl || f.filename || 'Arquivo'} />
                    </div>
                    <div className={styles.sub}>
                      {f.size ? formatBytes(f.size) : ''}
                      {f.size && f.created_at ? ' · ' : ''}
                      {f.created_at ? formatRelative(f.created_at) : ''}
                      {f.caption ? <> · {f.caption.slice(0, 60)}</> : null}
                    </div>
                  </div>
                </Link>
              ))}
              {data.hasMore?.files ? <LoadMore onClick={() => loadMore('files')} /> : null}
            </Section>
          ) : null}

        </div>
      ) : null}
    </div>
  );
}

// ── Reusable sub-components ───────────────────────────────────────────────────

/** XSS-safe: parses <mark> delimiters into React elements, never innerHTML. */
function Snippet({ raw }) {
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

function Section({ title, children }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>{title}</h2>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

function LoadMore({ onClick }) {
  return (
    <button type="button" className={styles.loadMore} onClick={onClick}>
      <ChevronDownIcon size={14} /> Ver mais
    </button>
  );
}

function FileThumb({ f }) {
  if ((f.kind === 'image' || f.kind === 'gif' || f.kind === 'video') && f.thumb_path) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/files/${f.thumb_path}`} alt="" className={styles.thumb} loading="lazy" />
    );
  }
  return (
    <span className={styles.fileIcon}>
      {f.kind === 'image' || f.kind === 'gif' ? <ImageIcon size={16} /> :
       f.kind === 'video' ? <VideoIcon size={16} /> :
       f.kind === 'audio' ? <MicIcon size={16} /> :
       <FileIcon size={16} />}
    </span>
  );
}
