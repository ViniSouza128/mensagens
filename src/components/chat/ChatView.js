'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { useApp } from '@/store/AppStateProvider';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import ChatHeader from './ChatHeader';
import ChatThread from './ChatThread';
import Composer from './Composer';
import PinnedBar from './PinnedBar';
import InChatSearch from './InChatSearch';
import ContactDrawer from './ContactDrawer';
import GroupDrawer from './GroupDrawer';
import dynamic from 'next/dynamic';
// Modais pesados são carregados sob demanda — economizam bundle inicial
// (cada um traz seus próprios deps: emoji panels, fetch APIs, recorders, etc).
const MediaPreviewModal    = dynamic(() => import('./MediaPreviewModal'), { ssr: false });
const MessageDetailsModal  = dynamic(() => import('./MessageDetailsModal'), { ssr: false });
const ForwardModal         = dynamic(() => import('./ForwardModal'), { ssr: false });
const PollComposerModal    = dynamic(() => import('./PollComposerModal'), { ssr: false });
const GifPicker            = dynamic(() => import('./GifPicker'), { ssr: false });
const StickerPicker        = dynamic(() => import('./StickerPicker'), { ssr: false });
const Lightbox             = dynamic(() => import('./Lightbox'), { ssr: false });
import { newShortId } from '@/lib/id';
import styles from './ChatView.module.css';

const MSG_HASH_RE = /^#msg-(.+)$/;

export default function ChatView({ chatId }) {
  const router = useRouter();
  const { user, subscribe, refreshChats, markChatRead } = useApp();
  const { toast } = useToast();
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [reply, setReply] = useState(null);
  const [previewQueue, setPreviewQueue] = useState([]);
  const [typing, setTyping] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [dropping, setDropping] = useState(false);
  const [details, setDetails] = useState(null);
  const [forwardSel, setForwardSel] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [chatSearch, setChatSearch] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const highlightOnLoad = useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [reportReason, setReportReason] = useState('');

  // Detect mobile (<=720px) to switch drawer mode: inline vs overlay
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    setIsMobile(mq.matches);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // v3: custom events do composer abrem modais
  useEffect(() => {
    const onPoll = () => setPollOpen(true);
    const onGif = () => setGifOpen(true);
    const onSticker = () => setStickerOpen(true);
    window.addEventListener('mensagens:openPoll', onPoll);
    window.addEventListener('mensagens:openGif', onGif);
    window.addEventListener('mensagens:openSticker', onSticker);
    return () => {
      window.removeEventListener('mensagens:openPoll', onPoll);
      window.removeEventListener('mensagens:openGif', onGif);
      window.removeEventListener('mensagens:openSticker', onSticker);
    };
  }, [toast]);

  // ── Refs for stable callbacks ─────────────────────────────────────────────
  const messagesRef = useRef(messages);
  const loadingRef = useRef(loading);
  const replyRef = useRef(reply);
  const sendRef = useRef(null);
  const lastReadMsgIdRef = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
    loadingRef.current = loading;
    replyRef.current = reply;
  });

  // ── Data fetching ─────────────────────────────────────────────────────────

  const loadChat = useCallback(async () => {
    try {
      const c = await api.get(`/api/chats/${chatId}`);
      setChat(c);
    } catch (err) {
      if (err.code === 'not_a_member' || err.code === 'chat_not_found') {
        toast('Conversa indisponível.', { tone: 'warning' });
        router.replace('/chats');
      }
    }
  }, [chatId, router, toast]);

  const loadMessages = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const url = opts.before
        ? `/api/chats/${chatId}/messages?before=${opts.before}`
        : `/api/chats/${chatId}/messages`;
      const data = await api.get(url);
      if (opts.before) {
        setMessages((prev) => [...data, ...prev]);
        setHasMore(data.length >= 40);
      } else {
        setMessages(data);
        setHasMore(data.length >= 40);
        // Cache da última página de mensagens p/ pintura instantânea ao reabrir o chat.
        try {
          const ric = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
          ric(() => {
            try {
              const trimmed = (data || []).slice(-40);
              window.localStorage.setItem(`mensagens.cache.msgs.${chatId}`, JSON.stringify(trimmed));
            } catch { /* quota */ }
          });
        } catch {}
      }
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    // Hidrata do cache ANTES de fazer o fetch — mensagens aparecem instantaneamente
    // mesmo em conexão lenta. O fetch substitui pelos dados frescos quando chega.
    try {
      const cached = window.localStorage.getItem(`mensagens.cache.msgs.${chatId}`);
      const arr = cached ? JSON.parse(cached) : null;
      setMessages(Array.isArray(arr) ? arr : []);
    } catch {
      setMessages([]);
    }
    setHasMore(true);
    setReply(null);
    setSelectionMode(false);
    setSelected(new Set());
    setChatSearch(false);
    setHighlightedMsgId(null);
    setDrawerOpen(false);
    lastReadMsgIdRef.current = null;
    markChatRead(chatId);
    loadChat();
    loadMessages();
  }, [chatId, loadChat, loadMessages, markChatRead]);

  // ── SSE: atualizações em tempo real ───────────────────────────────────────

  useEffect(() => {
    return subscribe((ev) => {
      if (!ev || ev.chat_id !== chatId) return;
      if (ev.type === 'message.new') {
        setMessages((prev) => {
          if (ev.client_id) {
            const idx = prev.findIndex((m) => m.client_id === ev.client_id);
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = { ...ev.message, client_id: ev.client_id };
              return next;
            }
          }
          if (prev.find((m) => m.id === ev.message.id)) return prev;
          return [...prev, ev.message];
        });
      } else if (ev.type === 'message.updated' || ev.type === 'message.deleted') {
        setMessages((prev) => prev.map((m) => (m.id === ev.message.id ? ev.message : m)));
      } else if (ev.type === 'message.reaction') {
        api.get(`/api/messages/${ev.message_id}`).then((d) => {
          const updated = d?.message || d;
          if (updated) setMessages((prev) => prev.map((m) => (m.id === ev.message_id ? updated : m)));
        }).catch(() => {});
      } else if (ev.type === 'message.read') {
        setMessages((prev) => prev.map((m) => (m.sender_id === user.id ? { ...m, status: 'read' } : m)));
      } else if (ev.type === 'typing.start') {
        // Bot LLM manda `thinking:true` enquanto consulta o Ollama;
        // `ttl_ms` permite TTL longo (90s) para modelos grandes/lentos.
        // Humanos vêm com defaults (thinking=false, ttl=6s).
        if (ev.user_id === user?.id) return;
        const name = ev.user_name || 'Alguém';
        const thinking = !!ev.thinking;
        const ttl = Math.min(Math.max(Number(ev.ttl_ms) || 6000, 1000), 120000);
        setTyping((prev) => {
          const existing = prev.find((e) => e.name === name);
          if (existing) {
            // Atualiza flag (passa de "thinking" pra "digitando" entre chunks)
            return prev.map((e) => (e.name === name ? { name, thinking } : e));
          }
          return [...prev, { name, thinking }];
        });
        setTimeout(() => setTyping((prev) => prev.filter((e) => e.name !== name)), ttl);
      } else if (ev.type === 'typing.stop') {
        if (ev.user_id === user?.id) return;
        const name = ev.user_name || 'Alguém';
        setTyping((prev) => prev.filter((e) => e.name !== name));
        // Belt-and-suspenders: o evento `message.new` do bot pode chegar
        // antes do `typing.stop` (caso normal) ou se perder se a SSE bagunçar
        // entre os dois. Fazemos um fetch curtinho APÓS o stop pra garantir
        // que qualquer mensagem que tenha entrado e não esteja na UI seja
        // reconciliada. Não-bloqueante; só anexa o que falta.
        api.get(`/api/chats/${chatId}/messages?limit=10`).then((data) => {
          if (!Array.isArray(data) || !data.length) return;
          setMessages((prev) => {
            const have = new Set(prev.map((m) => m.id));
            const missing = data.filter((m) => m.id && !have.has(m.id));
            if (!missing.length) return prev;
            // Insere preservando ordem cronológica (created_at asc)
            return [...prev, ...missing].sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
          });
        }).catch(() => {});
      } else if (ev.type === 'chat.pins' || ev.type === 'chat.updated') {
        loadChat();
      } else if (ev.type === 'chat.deleted') {
        toast('Este grupo foi apagado.', { tone: 'warning' });
        router.replace('/chats');
      } else if (ev.type === 'chat.cleared') {
        setMessages([]);
      }
    });
  }, [subscribe, chatId, user, loadChat, toast, router]);

  // ── Read receipt ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!messages.length) return;
    const last = messages[messages.length - 1];
    if (!last || last.sender_id === user?.id) return;
    if (last.id === lastReadMsgIdRef.current) return;
    lastReadMsgIdRef.current = last.id;
    markChatRead(chatId);
    api.post(`/api/chats/${chatId}/read`, { message_id: last.id, ts: Date.now() }).catch(() => {});
  }, [messages, chatId, user, markChatRead]);

  // ── URL hash → highlight on load ──────────────────────────────────────────
  useEffect(() => {
    const m = MSG_HASH_RE.exec(window.location.hash);
    if (m) {
      highlightOnLoad.current = m[1];
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [chatId]);

  useEffect(() => {
    if (!highlightOnLoad.current || loading || messages.length === 0) return;
    const id = highlightOnLoad.current;
    highlightOnLoad.current = null;
    goToMessageRef.current(id);
  }, [messages.length, loading]);

  // ── Scroll to message ─────────────────────────────────────────────────────
  const goToMessage = useCallback((msgId) => {
    setHighlightedMsgId(msgId);
    setTimeout(() => setHighlightedMsgId((cur) => (cur === msgId ? null : cur)), 2500);
    const el = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      toast('Role para cima para ver mensagens mais antigas.', { tone: 'warning' });
    }
  }, [toast]);

  const goToMessageRef = useRef(goToMessage);
  useEffect(() => { goToMessageRef.current = goToMessage; });

  // ── Poll fallback para resposta de bot ────────────────────────────────────
  // Em alguns cenários (HMR no dev, queda momentânea de SSE, evento perdido
  // entre reconexões do EventSource), o `message.new` do bot pode não chegar
  // via SSE — e a resposta só aparece após F5. Este poll é o seguro contra
  // isso: depois que o usuário manda algo num chat com bot, polla as últimas
  // mensagens a cada 2s até receber uma nova do bot ou estourar 90s.
  const botPollAbortRef = useRef(null);
  function startBotReplyPoll(afterMessageId) {
    // Cancela poll anterior se ainda rodava (usuário mandou nova msg antes
    // do bot terminar — o novo turno cobre o anterior).
    if (botPollAbortRef.current) { clearTimeout(botPollAbortRef.current); botPollAbortRef.current = null; }
    const startedAt = Date.now();
    const seen = new Set();
    seen.add(afterMessageId);
    const tick = async () => {
      if (Date.now() - startedAt > 90_000) return; // 90s budget
      try {
        const fresh = await api.get(`/api/chats/${chatId}/messages?limit=15`);
        if (Array.isArray(fresh)) {
          let gotBotMessage = false;
          setMessages((prev) => {
            const have = new Set(prev.map((m) => m.id));
            const missing = fresh.filter((m) => m.id && !have.has(m.id));
            if (!missing.length) return prev;
            // Bot replied if at least one missing message is from someone else
            if (missing.some((m) => m.sender_id !== user?.id)) gotBotMessage = true;
            return [...prev, ...missing].sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
          });
          if (gotBotMessage) return; // done — stop polling
        }
      } catch { /* ignore network blips */ }
      botPollAbortRef.current = setTimeout(tick, 2000);
    };
    botPollAbortRef.current = setTimeout(tick, 1500); // primeira tentativa após 1.5s
  }
  useEffect(() => () => { if (botPollAbortRef.current) clearTimeout(botPollAbortRef.current); }, []);

  // ── Send message ──────────────────────────────────────────────────────────
  async function send({ body, attachments, type, voice, poll, extra }) {
    const currentReply = replyRef.current;
    const client_id = newShortId();
    const msgType = type || (attachments?.length ? attachments[0].kind : 'text');

    // Anexos podem chegar com `file` (Blob) — fazemos upload primeiro.
    let uploadedAttachments = attachments || [];
    if (uploadedAttachments.some((a) => a && a.file)) {
      try {
        uploadedAttachments = await Promise.all(
          uploadedAttachments.map(async (a) => {
            if (!a.file) return a;
            const fd = new FormData();
            fd.append('file', a.file);
            fd.append('kindHint', a.kind || 'file');
            const arr = await api.uploadWithProgress('/api/uploads', fd);
            const data = Array.isArray(arr) ? arr[0] : arr;
            return {
              kind: data.kind || a.kind,
              mime: data.mime || a.mime,
              filename: a.file.name,
              size: data.size,
              width: data.width,
              height: data.height,
              duration_ms: data.duration_ms || a.duration_ms,
              storage_path: data.storage_path,
              thumb_path: data.thumb_path || null,
              poster_path: data.poster_path || null,
            };
          })
        );
      } catch (err) {
        toast('Falha ao enviar anexo: ' + (err?.message || err), { tone: 'error' });
        return;
      }
    }
    attachments = uploadedAttachments;
    const optimistic = {
      id: `tmp_${client_id}`,
      client_id,
      chat_id: chatId,
      sender_id: user.id,
      type: msgType,
      body: body || null,
      attachments: attachments || [],
      voice: voice || null,
      poll: poll || null,
      reactions: [], starred: false,
      reply_to: currentReply
        ? { id: currentReply.id, sender_id: currentReply.sender_id, body: currentReply.body, type: currentReply.type, deleted: !!currentReply.deleted }
        : null,
      status: 'sending',
      created_at: Date.now(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setReply(null);
    try {
      const payload = {
        type: msgType,
        body: body || null,
        reply_to_id: currentReply?.id || null,
        attachments: attachments || [],
        client_id,
      };
      if (voice) payload.voice = voice;
      if (poll) payload.poll = poll;
      if (extra) payload.extra = extra;
      const sent = await api.post(`/api/chats/${chatId}/messages`, payload);
      setMessages((prev) => prev.map((m) => (m.client_id === client_id ? { ...sent, client_id } : m)));
      refreshChats();
      // Se o destinatário é um bot LLM, garante via poll que vamos ver a resposta
      // mesmo se a SSE bagunçar (HMR/reconexão). Idempotente: para se já recebeu.
      if (chat?.partner?.is_bot) startBotReplyPoll(sent.id);
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m.client_id === client_id ? { ...m, status: 'failed', error: err.code || 'send_failed' } : m)));
      if (err.code === 'requires_contact_request') {
        toast('Esse usuário bloqueia desconhecidos. Solicitação enviada.', { tone: 'warning' });
      } else if (err.code === 'rate_limited') {
        toast('Você está enviando rápido demais.', { tone: 'warning' });
      } else if (err.code === 'blocked_by_target' || err.code === 'you_blocked_user') {
        toast('Mensagem bloqueada.', { tone: 'warning' });
      }
    }
  }
  sendRef.current = send;

  // ── Stable handlers ───────────────────────────────────────────────────────
  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    const oldest = messagesRef.current[0]?.created_at;
    if (oldest) loadMessages({ before: oldest });
  }, [hasMore, loadMessages]);

  const retry = useCallback(async (msg) => {
    setMessages((prev) => prev.filter((m) => m.client_id !== msg.client_id));
    await sendRef.current?.({ body: msg.body, attachments: msg.attachments });
  }, []);

  const react = useCallback(async (msg, emoji) => {
    try { await api.post(`/api/messages/${msg.id}/react`, { emoji }); } catch { /* noop */ }
  }, []);

  const star = useCallback(async (msg, value) => {
    try {
      await api.post(`/api/messages/${msg.id}/star`, { starred: value });
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, starred: value } : m)));
    } catch { /* noop */ }
  }, []);

  const pin = useCallback(async (msg, value) => {
    try {
      await api.post(`/api/messages/${msg.id}/pin`, { chat_id: chatId, pinned: value });
      loadChat();
    } catch { /* noop */ }
  }, [chatId, loadChat]);

  const remove = useCallback((msg) => { setDeleteTarget(msg); }, []);

  const report = useCallback((msg) => {
    setReportTarget(msg);
    setReportReason('');
  }, []);

  async function doDelete(msg) {
    setDeleteTarget(null);
    if (!msg) return;
    const id = msg.id;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, _pendingDelete: true } : m)));
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try { await api.delete(`/api/messages/${id}`); }
      catch { toast('Não foi possível apagar a mensagem.', { tone: 'danger' }); }
    }, 5000);
    toast('Mensagem apagada.', {
      tone: 'success',
      duration: 5000,
      action: {
        label: 'Desfazer',
        onClick: () => {
          cancelled = true;
          clearTimeout(timer);
          setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, _pendingDelete: false } : m)));
        },
      },
    });
  }

  async function doReport() {
    const msg = reportTarget;
    const reason = reportReason.trim();
    if (!msg || !reason) return;
    setReportTarget(null);
    setReportReason('');
    try {
      await api.post('/api/reports', { target_type: 'message', target_id: msg.id, reason });
      toast('Denúncia enviada. Obrigado.', { tone: 'success' });
    } catch {
      toast('Não foi possível enviar a denúncia.', { tone: 'danger' });
    }
  }

  const startReply = useCallback((msg) => { setReply(msg); }, []);

  const saveEdit = useCallback(async (msg, body) => {
    if (!msg?.id || typeof body !== 'string') return;
    try {
      const updated = await api.patch(`/api/messages/${msg.id}`, { body });
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch (err) {
      toast(err.code === 'edit_window_closed'
        ? 'Você não pode mais editar essa mensagem.'
        : 'Não foi possível editar a mensagem.', { tone: 'danger' });
    }
  }, [toast]);

  const toggleSelection = useCallback((msg) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(msg.id)) next.delete(msg.id); else next.add(msg.id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setSelectionMode(false);
  }, []);

  const openQueue = useCallback((input) => {
    const items = [...input].map((f) => {
      if (f instanceof File) {
        const isImage = /^image\//.test(f.type) && f.type !== 'image/gif';
        const isGif = f.type === 'image/gif';
        const isVideo = /^video\//.test(f.type);
        const isAudio = /^audio\//.test(f.type);
        const kind = isImage ? 'image' : isGif ? 'gif' : isVideo ? 'video' : isAudio ? 'audio' : 'file';
        return { kind, file: f, src: URL.createObjectURL(f), name: f.name };
      }
      return f;
    });
    setPreviewQueue((prev) => [...prev, ...items]);
  }, []);

  const advanceQueue = useCallback(() => {
    setPreviewQueue((prev) => {
      if (prev[0]?.src?.startsWith('blob:')) URL.revokeObjectURL(prev[0].src);
      return prev.slice(1);
    });
  }, []);

  const handleOpenPreview = useCallback((p) => {
    if (p?.view) {
      const all = collectMediaFromMessages(messagesRef.current);
      const idx = Math.max(0, all.findIndex((it) => it.src === p.src));
      setLightbox({ items: all.length ? all : [{ kind: p.kind, src: p.src, name: p.name }], index: idx });
      return;
    }
    openQueue([p]);
  }, [openQueue]);

  const handleForward     = useCallback((m) => setForwardSel([m.id]), []);
  const handleDetails     = useCallback((m) => setDetails(m), []);
  const handleStartSel    = useCallback(() => setSelectionMode(true), []);

  // ── Drag-and-drop ─────────────────────────────────────────────────────────
  function onDragOver(e) { e.preventDefault(); setDropping(true); }
  function onDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDropping(false);
  }
  function onDrop(e) {
    e.preventDefault();
    setDropping(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) openQueue(files);
  }

  if (!chat) {
    return <div className={styles.loading} aria-busy="true">Carregando…</div>;
  }

  const currentPreview = previewQueue[0] || null;
  // (legado: era usado para grid template rows; agora .wrap usa flex column)

  // Shared drawer props
  const drawerProps = {
    open: drawerOpen,
    onClose: () => setDrawerOpen(false),
    chat,
    onChange: loadChat,
  };

  return (
    <div className={styles.outer}>
      {/* ── Main content column ───────────────────────────────────── */}
      <div
        className={[styles.wrap, dropping ? styles.dropping : ''].join(' ')}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <ChatHeader
          chat={chat}
          onOpenInfo={() => setDrawerOpen((v) => !v)}
          selectionMode={selectionMode}
          selectedCount={selected.size}
          onClearSelection={clearSelection}
          onForwardSelection={() => setForwardSel([...selected])}
          searchOpen={chatSearch}
          onToggleSearch={() => setChatSearch((s) => !s)}
          infoOpen={drawerOpen}
        />
        <PinnedBar chat={chat} messages={messages} onUnpin={(m) => pin(m, false)} />
        {chatSearch ? (
          <InChatSearch chatId={chatId} onGoTo={goToMessage} onClose={() => setChatSearch(false)} />
        ) : null}
        <ChatThread
          chat={chat}
          me={user}
          messages={messages}
          hasMore={hasMore}
          loading={loading}
          typing={typing}
          onLoadMore={handleLoadMore}
          onReply={startReply}
          onEdit={saveEdit}
          onDelete={remove}
          onReact={react}
          onStar={star}
          onPin={pin}
          onForward={handleForward}
          onRetry={retry}
          onDetails={handleDetails}
          onOpenPreview={handleOpenPreview}
          onReport={report}
          selectionMode={selectionMode}
          selected={selected}
          onToggleSelect={toggleSelection}
          onStartSelection={handleStartSel}
          highlightedMsgId={highlightedMsgId}
        />
        <Composer
          chat={chat}
          me={user}
          reply={reply}
          onCancelReply={() => setReply(null)}
          onSend={send}
          onPreview={(items) => openQueue(Array.isArray(items) ? items : [items])}
        />
        {dropping ? (
          <div className={styles.dropOverlay} aria-hidden>
            <span className={styles.dropOverlayText}>Solte para anexar</span>
          </div>
        ) : null}
      </div>

      {/* ── Right inline info panel (desktop only) ────────────────── */}
      {!isMobile && (
        <div className={[styles.infoPanel, drawerOpen ? styles.infoPanelOpen : ''].join(' ')}>
          {chat?.type === 'group' ? (
            <GroupDrawer
              {...drawerProps}
              me={user}
              inline
              onSearchInChat={() => { setDrawerOpen(false); setChatSearch(true); }}
            />
          ) : (
            <ContactDrawer {...drawerProps} inline />
          )}
        </div>
      )}

      {/* ── Mobile: overlay drawers ───────────────────────────────── */}
      {isMobile && (
        chat?.type === 'group' ? (
          <GroupDrawer
            {...drawerProps}
            me={user}
            onSearchInChat={() => { setDrawerOpen(false); setChatSearch(true); }}
          />
        ) : (
          <ContactDrawer {...drawerProps} />
        )
      )}

      {/* ── Modals (montados sob demanda — chunks só baixam quando abertos) ─ */}
      {currentPreview ? (
        <MediaPreviewModal
          open
          initial={currentPreview}
          queueIndex={0}
          queueTotal={previewQueue.length}
          onClose={advanceQueue}
          onSend={(payload) => { send(payload); advanceQueue(); }}
        />
      ) : null}
      {lightbox ? (
        <Lightbox
          open
          items={lightbox.items || []}
          index={lightbox.index ?? 0}
          onClose={() => setLightbox(null)}
        />
      ) : null}
      {details ? (
        <MessageDetailsModal open onClose={() => setDetails(null)} message={details} />
      ) : null}
      {forwardSel ? (
        <ForwardModal
          open
          onClose={() => setForwardSel(null)}
          messageIds={forwardSel || []}
          onSent={() => { setForwardSel(null); clearSelection(); }}
        />
      ) : null}
      {pollOpen ? (
        <PollComposerModal
          open
          onClose={() => setPollOpen(false)}
          onSubmit={(poll) => {
            setPollOpen(false);
            send({ body: null, type: 'poll', poll, attachments: [] });
          }}
        />
      ) : null}
      {gifOpen ? (
        <GifPicker
          open
          onClose={() => setGifOpen(false)}
          onPick={(gif) => {
            send({
              body: gif.url,
              type: 'gif',
              extra: { gif: { width: gif.width, height: gif.height, title: gif.title || null } },
              attachments: [],
            });
          }}
        />
      ) : null}
      {stickerOpen ? (
        <StickerPicker
          open
          onClose={() => setStickerOpen(false)}
          onPick={(sticker) => {
            send({
              body: sticker.url,
              type: 'sticker',
              extra: { sticker: { alt: sticker.alt } },
              attachments: [],
            });
          }}
        />
      ) : null}

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Apagar mensagem"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button danger onClick={() => doDelete(deleteTarget)}>Apagar</Button>
          </>
        }
      >
        <p>Apagar esta mensagem para todos? Esta ação não pode ser desfeita.</p>
      </Modal>

      <Modal
        open={!!reportTarget}
        onClose={() => setReportTarget(null)}
        title="Denunciar mensagem"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReportTarget(null)}>Cancelar</Button>
            <Button onClick={doReport} disabled={!reportReason.trim()}>Enviar denúncia</Button>
          </>
        }
      >
        <p style={{ marginBottom: 12 }}>Descreva o motivo da denúncia. Nossa equipe analisa em breve.</p>
        <textarea
          className={styles.reportInput}
          value={reportReason}
          onChange={(e) => setReportReason(e.target.value)}
          placeholder="Ex: conteúdo inapropriado, spam, assédio…"
          rows={4}
          maxLength={500}
          autoFocus
        />
      </Modal>
    </div>
  );
}

function collectMediaFromMessages(messages) {
  const out = [];
  for (const m of messages || []) {
    if (m.deleted || m._pendingDelete) continue;
    const att = m.attachments?.[0];
    if (!att) continue;
    if (att.kind === 'image' || att.kind === 'gif' || att.kind === 'video') {
      out.push({ kind: att.kind, src: `/api/files/${att.storage_path}`, name: att.filename || null });
    }
  }
  return out;
}
