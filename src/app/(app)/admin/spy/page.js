'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import ChatView from '@/components/chat/ChatView';
import { api } from '@/services/api';
import { useApp } from '@/store/AppStateProvider';
import { useToast } from '@/components/ui/Toast';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import {
  DownloadIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
  ThreadIcon,
  UsersIcon,
} from '@/components/icons/Icons';
import styles from './spy.module.css';

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function previewText(message) {
  if (!message) return 'Sem mensagens ainda';
  if (message.deleted) return '[mensagem apagada]';
  if (message.body) return message.body;
  return `[${message.type || 'mensagem'}]`;
}

export default function AdminSpyPage() {
  const router = useRouter();
  const { user } = useApp();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [selectedChat, setSelectedChat] = useState(null);
  const [editsTarget, setEditsTarget] = useState(null);
  const [edits, setEdits] = useState([]);
  const [editsLoading, setEditsLoading] = useState(false);

  useEffect(() => {
    if (user && !user.is_admin) router.replace('/chats');
  }, [router, user]);

  const loadUsers = useCallback(async () => {
    if (!user?.is_admin) return;
    setUsersLoading(true);
    try {
      const p = new URLSearchParams();
      if (debouncedQ) p.set('q', debouncedQ);
      p.set('limit', '50');
      const list = await api.get(`/api/admin/spy/users?${p.toString()}`);
      setUsers(Array.isArray(list) ? list : []);
      if (selectedUser && !list.some((item) => item.id === selectedUser.id)) {
        setSelectedUser(null);
        setSelectedChat(null);
      }
    } catch {
      toast('Falha ao carregar usuários para auditoria.', { tone: 'danger' });
    } finally {
      setUsersLoading(false);
    }
  }, [debouncedQ, selectedUser, toast, user]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const loadChats = useCallback(async (target) => {
    if (!target?.id) return;
    setChatsLoading(true);
    try {
      const list = await api.get(`/api/admin/spy/users/${target.id}/chats`);
      const next = Array.isArray(list) ? list : [];
      setChats(next);
      setSelectedChat((current) => {
        if (current && next.some((chat) => chat.chat_id === current.chat_id)) return current;
        return next[0] || null;
      });
    } catch {
      toast('Falha ao carregar conversas do usuário.', { tone: 'danger' });
    } finally {
      setChatsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    setChats([]);
    setSelectedChat(null);
    if (selectedUser) loadChats(selectedUser);
  }, [loadChats, selectedUser]);

  const chatForView = useMemo(() => {
    if (!selectedChat) return null;
    return {
      ...selectedChat,
      id: selectedChat.chat_id,
      name: selectedChat.name,
      avatar_path: selectedChat.avatar_path,
      partner: selectedChat.peer || null,
      pinned: [],
      members: [],
    };
  }, [selectedChat]);

  async function exportUser() {
    if (!selectedUser) return;
    try {
      const res = await fetch(`/api/admin/spy/users/${selectedUser.id}/export`, { credentials: 'include' });
      if (!res.ok) throw new Error('export_failed');
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `export-${selectedUser.username}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      toast('Não foi possível exportar as mensagens.', { tone: 'danger' });
    }
  }

  async function openEdits(message) {
    setEditsTarget(message);
    setEdits([]);
    setEditsLoading(true);
    try {
      const list = await api.get(`/api/admin/spy/messages/${message.id}/edits`);
      setEdits(Array.isArray(list) ? list : []);
    } catch {
      toast('Falha ao carregar histórico de edições.', { tone: 'danger' });
    } finally {
      setEditsLoading(false);
    }
  }

  if (!user) return <div className={styles.empty}>Carregando…</div>;
  if (!user.is_admin) return null;

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}><ShieldIcon size={20} /> Leitura administrativa</h1>
          <p className={styles.subtitle}>Acesso auditado às conversas para suporte, segurança e moderação.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={loadUsers} iconLeft={<RefreshIcon size={14} />}>Atualizar</Button>
      </header>

      <section className={styles.explorer}>
        <aside className={styles.usersPane}>
          <div className={styles.paneHead}>
            <div className={styles.searchBox}>
              <SearchIcon size={15} className={styles.searchIcon} />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar usuário..."
                style={{ paddingLeft: 30 }}
              />
            </div>
            {selectedUser ? (
              <Button size="sm" variant="ghost" onClick={exportUser} iconLeft={<DownloadIcon size={14} />}>
                Exportar
              </Button>
            ) : null}
          </div>
          <div className={styles.list}>
            {usersLoading ? <div className={styles.emptySmall}>Carregando usuários…</div> : null}
            {!usersLoading && users.length === 0 ? <div className={styles.emptySmall}>Nenhum usuário encontrado.</div> : null}
            {users.map((item) => (
              <button
                key={item.id}
                type="button"
                className={[styles.userItem, selectedUser?.id === item.id ? styles.active : ''].join(' ')}
                onClick={() => setSelectedUser(item)}
              >
                <Avatar name={item.name || item.username} src={item.avatar_path} size={36} online={item.online} />
                <span className={styles.itemText}>
                  <strong>{item.name || item.username}</strong>
                  <span>@{item.username} · {item.chat_count || 0} conversas</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <aside className={styles.chatsPane}>
          <div className={styles.paneTitle}>
            <ThreadIcon size={16} />
            <span>{selectedUser ? `Conversas de @${selectedUser.username}` : 'Selecione um usuário'}</span>
          </div>
          <div className={styles.list}>
            {chatsLoading ? <div className={styles.emptySmall}>Carregando conversas…</div> : null}
            {!chatsLoading && selectedUser && chats.length === 0 ? <div className={styles.emptySmall}>Sem conversas.</div> : null}
            {!selectedUser ? <div className={styles.emptySmall}>Escolha alguém na coluna da esquerda.</div> : null}
            {chats.map((chat) => (
              <button
                key={chat.chat_id}
                type="button"
                className={[styles.chatItem, selectedChat?.chat_id === chat.chat_id ? styles.active : ''].join(' ')}
                onClick={() => setSelectedChat(chat)}
              >
                {chat.type === 'direct' ? (
                  <Avatar name={chat.name} src={chat.avatar_path} size={36} online={chat.peer?.online} />
                ) : (
                  <span className={styles.groupAvatar}><UsersIcon size={18} /></span>
                )}
                <span className={styles.itemText}>
                  <strong>{chat.name}</strong>
                  <span>{previewText(chat.last_message)}</span>
                </span>
                <span className={styles.time}>{fmtTime(chat.last_message_at)}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className={styles.messagesPane}>
          {chatForView ? (
            <ChatView
              key={chatForView.id}
              chatId={chatForView.id}
              spectatorMode
              spectatorChat={chatForView}
              messagesEndpoint={`/api/admin/spy/chats/${chatForView.id}/messages`}
              onShowEdits={openEdits}
            />
          ) : (
            <div className={styles.emptyState}>
              <ShieldIcon size={28} />
              <strong>Nenhuma conversa aberta</strong>
              <span>Selecione um usuário e uma conversa para iniciar a visualização auditada.</span>
            </div>
          )}
        </main>
      </section>

      <Modal
        open={!!editsTarget}
        onClose={() => setEditsTarget(null)}
        title="Histórico de edições"
        footer={<Button variant="ghost" onClick={() => setEditsTarget(null)}>Fechar</Button>}
      >
        {editsLoading ? (
          <div className={styles.emptySmall}>Carregando edições…</div>
        ) : edits.length === 0 ? (
          <div className={styles.emptySmall}>Sem histórico registrado para esta mensagem.</div>
        ) : (
          <div className={styles.editsList}>
            {edits.map((edit) => (
              <div key={edit.id} className={styles.editItem}>
                <time>{new Date(edit.edited_at).toLocaleString('pt-BR')}</time>
                <p>{edit.body_before || <em>Mensagem vazia</em>}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
