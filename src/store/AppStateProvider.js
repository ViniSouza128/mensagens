'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/services/api';

const Ctx = createContext(null);

// Cache otimista em localStorage. Permite primeira pintura instantânea
// (sem aguardar /api/chats) — usuário vê a lista anterior enquanto a fetch atualiza.
const CHATS_CACHE_KEY = 'mensagens.cache.chats.v1';
const ARCHIVED_CACHE_KEY = 'mensagens.cache.archived.v1';

function readCache(key) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function writeCache(key, data) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, JSON.stringify(data || [])); } catch { /* quota */ }
}

export function AppStateProvider({ initialUser, children }) {
  const [user, setUser] = useState(initialUser || null);
  // IMPORTANTE: estado inicial vazio para casar SSR ↔ hidratação inicial.
  // O cache do localStorage é hidratado em useEffect (1 tick após mount) para
  // evitar hydration mismatch (StoriesBar, ChatList etc).
  const [chats, setChats] = useState([]);
  const [archivedChats, setArchivedChats] = useState([]);
  const [requestsCount, setRequestsCount] = useState(0);

  // Hydration do cache APÓS mount — sem mismatch.
  useEffect(() => {
    const c = readCache(CHATS_CACHE_KEY);
    if (c.length) setChats(c);
    const a = readCache(ARCHIVED_CACHE_KEY);
    if (a.length) setArchivedChats(a);
  }, []);

  // Persiste cache toda vez que muda (debounced via rIC).
  const chatsCacheTimer = useRef(null);
  useEffect(() => {
    clearTimeout(chatsCacheTimer.current);
    const ric = typeof window !== 'undefined' && window.requestIdleCallback
      ? window.requestIdleCallback
      : (cb) => setTimeout(cb, 200);
    chatsCacheTimer.current = setTimeout(() => ric(() => writeCache(CHATS_CACHE_KEY, chats)), 250);
    return () => clearTimeout(chatsCacheTimer.current);
  }, [chats]);
  useEffect(() => { writeCache(ARCHIVED_CACHE_KEY, archivedChats); }, [archivedChats]);

  const eventsRef = useRef(null);
  const listenersRef = useRef(new Set());
  // Timer ref for debounced full refresh (used after message.updated/deleted events)
  const refreshTimerRef = useRef(null);

  const refreshMe = useCallback(async () => {
    const u = await api.get('/api/auth/me').catch(() => null);
    setUser(u);
    return u;
  }, []);

  const refreshChats = useCallback(async () => {
    if (!user) return;
    const data = await api.get('/api/chats').catch(() => []);
    setChats(data || []);
  }, [user]);

  const refreshArchived = useCallback(async () => {
    if (!user) return;
    const data = await api.get('/api/chats?archived=1').catch(() => []);
    setArchivedChats(data || []);
  }, [user]);

  const refreshRequests = useCallback(async () => {
    if (!user) return;
    const data = await api.get('/api/contacts/requests?direction=incoming').catch(() => []);
    setRequestsCount((data || []).length);
  }, [user]);

  // Debounced full refresh — coalesces rapid-fire events into one request.
  // Used for message.updated/deleted where we can't easily patch incrementally.
  const scheduleRefreshChats = useCallback(() => {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(refreshChats, 3000);
  }, [refreshChats]);

  useEffect(() => () => clearTimeout(refreshTimerRef.current), []);

  // Refs estáveis para as callbacks — evita que a identidade nova de
  // `scheduleRefreshChats` / `refreshRequests` a cada render derrube o
  // EventSource. Antes esse efeito dependia delas direto; em dev mode
  // (Fast Refresh / HMR) e até em produção quando `user` é atualizado por
  // refreshMe(), a SSE era fechada e reaberta — eventos publicados no meio
  // (ex.: resposta do bot LLM que chega 2-5s depois) se perdiam, e a UI só
  // mostrava a resposta após F5.
  const scheduleRefreshChatsRef = useRef(scheduleRefreshChats);
  const refreshRequestsRef = useRef(refreshRequests);
  useEffect(() => { scheduleRefreshChatsRef.current = scheduleRefreshChats; }, [scheduleRefreshChats]);
  useEffect(() => { refreshRequestsRef.current = refreshRequests; }, [refreshRequests]);

  // Mantém apenas `user?.id` como dep — só re-abrimos a SSE se o usuário
  // logado mudou. Isto fixa o bug de respostas do bot só aparecerem após
  // refresh em algumas condições.
  const userId = user?.id || null;
  useEffect(() => {
    if (!userId) return;
    const es = new EventSource('/api/events');
    eventsRef.current = es;

    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);

        if (data.type === 'message.new') {
          // Incremental update: move the affected chat to top with new last_message.
          // Avoids a full API round-trip on every incoming message.
          const { chat_id, message } = data;
          let chatFound = false;
          setChats((prev) => {
            const idx = prev.findIndex((c) => c.id === chat_id);
            if (idx < 0) return prev; // unknown chat handled by scheduleRefreshChats below
            chatFound = true;
            const old = prev[idx];
            const isMine = message.sender_id === userId;
            const updated = {
              ...old,
              last_message: message,
              last_message_at: message.created_at,
              // Reset unread for our own messages; increment for others
              unread: isMine ? 0 : (old.unread || 0) + 1,
            };
            // Move to top (most recently active chat first)
            const next = [updated, ...prev.filter((_, i) => i !== idx)];
            return next;
          });
          // If the chat wasn't in the list (e.g. just added to a group), do a full refresh
          if (!chatFound) scheduleRefreshChatsRef.current?.();
        } else if (data.type === 'message.updated' || data.type === 'message.deleted') {
          // Debounced full refresh — last_message might have changed
          scheduleRefreshChatsRef.current?.();
        } else if (data.type === 'chat.cleared') {
          // Histórico do chat foi apagado (POST /api/chats/:id/clear).
          // Limpamos o preview da última mensagem na lista lateral
          // imediatamente — senão o item continua mostrando a mensagem antiga
          // até a próxima refresh full. Também limpa o cache otimista de
          // mensagens no localStorage para que reabrir o chat não restaure
          // mensagens já apagadas.
          const cid = data.chat_id;
          setChats((prev) => prev.map((c) => c.id === cid
            ? { ...c, last_message: null, last_message_at: c.created_at || null, unread: 0 }
            : c));
          try { window.localStorage.removeItem(`mensagens.cache.msgs.${cid}`); } catch { /* quota */ }
          // Refresh full em segundo plano para reconciliar tudo (ordenação,
          // pinned/archived state, etc).
          scheduleRefreshChatsRef.current?.();
        }

        if (data.type === 'contact_request.new' || data.type === 'contact_request.responded') {
          refreshRequestsRef.current?.();
        }

        listenersRef.current.forEach((fn) => {
          try { fn(data); } catch { /* noop */ }
        });
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects nativamente
    };

    return () => {
      es.close();
      eventsRef.current = null;
    };
  }, [userId]);

  useEffect(() => {
    refreshChats();
    refreshArchived();
    refreshRequests();
  }, [refreshChats, refreshArchived, refreshRequests]);

  // Clears unread count locally without a full API refetch.
  // Called when a user enters a chat or marks messages as read.
  const markChatRead = useCallback((chatId) => {
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, unread: 0 } : c));
  }, []);

  const subscribe = useCallback((fn) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  }, []);

  const value = useMemo(() => ({
    user, setUser, refreshMe,
    chats, refreshChats, markChatRead,
    archivedChats, refreshArchived,
    requestsCount, refreshRequests,
    subscribe,
  }), [user, refreshMe, chats, refreshChats, markChatRead, archivedChats, refreshArchived, requestsCount, refreshRequests, subscribe]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp deve ser usado dentro de AppStateProvider');
  return v;
}
