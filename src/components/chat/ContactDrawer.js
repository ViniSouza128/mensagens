'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Drawer from '@/components/ui/Drawer';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/services/api';
import { ShieldIcon, FlagIcon, UserIcon, BellIcon, BellOffIcon, ArchiveIcon, EditIcon, CheckIcon, XIcon, TrashIcon } from '@/components/icons/Icons';
import styles from './ContactDrawer.module.css';

// Lightbox é pesado (zoom, swipe, etc) — carrega só quando o usuário clica
// no avatar para abrir em tela cheia.
const Lightbox = dynamic(() => import('./Lightbox'), { ssr: false });

export default function ContactDrawer({ open, onClose, chat, onChange, inline }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [rel, setRel] = useState(null); // relationship data from /api/users/:id
  const [editingAlias, setEditingAlias] = useState(false);
  const [aliasInput, setAliasInput] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [avatarBig, setAvatarBig] = useState(false);

  const peer = chat?.partner || null;
  const isBot = !!peer?.is_bot;

  // Fetch fresh relationship data when drawer opens
  useEffect(() => {
    if (!open || !peer?.id) { setRel(null); return; }
    api.get(`/api/users/${peer.id}`).then((u) => {
      setRel(u);
      setAliasInput(u.alias || '');
    }).catch(() => {});
  }, [open, peer?.id]);

  async function action(fn, msg) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (msg) toast(msg, { tone: 'success' });
      onChange?.();
      // Refresh relationship data after action
      if (peer?.id) {
        api.get(`/api/users/${peer.id}`).then((u) => {
          setRel(u);
          setAliasInput(u.alias || '');
        }).catch(() => {});
      }
    } catch {
      toast('Não foi possível concluir.', { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  async function saveAlias() {
    if (!peer?.id) return;
    try {
      await api.patch('/api/contacts', { user_id: peer.id, alias: aliasInput.trim() || null });
      setRel((r) => r ? { ...r, alias: aliasInput.trim() || null } : r);
      setEditingAlias(false);
    } catch {
      toast('Não foi possível salvar apelido.', { tone: 'danger' });
    }
  }

  // Limpa todo o histórico do chat. Para chats com bot, equivale a iniciar
  // uma nova conversa — o bot perde a janela de contexto (lê histórico do
  // banco para montar prompt, então sem histórico = sem memória).
  async function clearConversation() {
    if (!chat?.id) return;
    setConfirmClear(false);
    try {
      await api.post(`/api/chats/${chat.id}/clear`, {});
      toast(isBot ? `Conversa apagada — ${peer?.name || 'o bot'} esqueceu tudo.` : 'Conversa apagada.', { tone: 'success' });
      onChange?.();
    } catch {
      toast('Não foi possível limpar a conversa.', { tone: 'danger' });
    }
  }

  const isContact = rel?.contact ?? false;
  const isBlocked = rel?.blocked_by_me ?? false;
  const displayAlias = rel?.alias || null;

  // Resolve avatar src: tanto `avatar_path` (campo correto da API) quanto o
  // legacy `avatar` (mantém compat). O <Avatar> já prefixa com `/api/files/`
  // quando o src não começa com http.
  const chatAvatarSrc = chat?.avatar_path || chat?.avatar || null;

  const panelContent = (
    <>
      <div className={styles.head}>
        {/* Avatar agora é um botão — clica e abre o lightbox em tela cheia.
            Se for bot, mostra modelo + tagline; se for humano, mostra nome
            normal. */}
        <button
          type="button"
          className={styles.avatarBtn}
          onClick={() => { if (chatAvatarSrc) setAvatarBig(true); }}
          aria-label={chatAvatarSrc ? 'Ampliar foto' : (chat?.name || 'Avatar')}
          disabled={!chatAvatarSrc}
        >
          <Avatar
            name={chat?.name}
            src={chatAvatarSrc}
            size={inline ? 96 : 112}
            eager
          />
        </button>
        <h2 className={styles.name}>{displayAlias || chat?.name || 'Conversa'}</h2>
        {displayAlias && chat?.name && displayAlias !== chat.name
          ? <p className={styles.realName}>{chat.name}</p>
          : null}
        {peer?.username && !isBot ? <p className={styles.username}>@{peer.username}</p> : null}
        {isBot ? <p className={styles.username}>Bot AI · {peer?.bot_model || 'modelo local'}</p> : null}
        {peer?.bio ? <p className={styles.bio}>{peer.bio}</p> : null}
      </div>

      {peer && isContact && !isBot ? (
        <div className={styles.section}>
          <h3 className={styles.h3}>Apelido local</h3>
          {editingAlias ? (
            <div className={styles.aliasRow}>
              <input
                className={styles.aliasInput}
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                placeholder={chat?.name || 'Apelido…'}
                maxLength={80}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveAlias();
                  if (e.key === 'Escape') setEditingAlias(false);
                }}
              />
              <button type="button" className={styles.aliasBtn} onClick={saveAlias} aria-label="Salvar apelido"><CheckIcon size={14} /></button>
              <button type="button" className={styles.aliasBtn} onClick={() => setEditingAlias(false)} aria-label="Cancelar"><XIcon size={14} /></button>
            </div>
          ) : (
            <div className={styles.aliasRow}>
              <span className={styles.aliasValue}>{displayAlias || <em className={styles.aliasMuted}>Nenhum</em>}</span>
              <button type="button" className={styles.aliasBtn} onClick={() => setEditingAlias(true)} aria-label="Editar apelido"><EditIcon size={14} /></button>
            </div>
          )}
        </div>
      ) : null}

      <div className={styles.section}>
        <h3 className={styles.h3}>Ações</h3>
        <div className={styles.actions}>
          {chat?.muted ? (
            <Button variant="ghost" onClick={() => action(() => api.patch(`/api/chats/${chat.id}/state`, { muted_until: null }), 'Notificações ativadas.')}>
              <BellIcon size={16} /> Ativar notificações
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => action(() => api.patch(`/api/chats/${chat.id}/state`, { muted_until: Date.now() + 8 * 3600 * 1000 }), 'Conversa silenciada.')}>
              <BellOffIcon size={16} /> Silenciar
            </Button>
          )}
          <Button variant="ghost" onClick={() => action(() => api.patch(`/api/chats/${chat.id}/state`, { archived: !chat.archived }), chat?.archived ? 'Conversa restaurada.' : 'Conversa arquivada.')}>
            <ArchiveIcon size={16} /> {chat?.archived ? 'Desarquivar' : 'Arquivar'}
          </Button>

          {/* Limpar conversa — disponível pra todos os chats. Pra bots,
              equivale a "começar de novo" (sem memória). */}
          <Button variant="ghost" danger onClick={() => setConfirmClear(true)}>
            <TrashIcon size={16} /> Limpar conversa
          </Button>

          {peer ? (
            <>
              {!isBot && (isContact ? (
                <Button variant="ghost" onClick={() => action(() => api.delete('/api/contacts', { user_id: peer.id }), 'Removido dos contatos.')}>
                  <UserIcon size={16} /> Remover dos contatos
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => action(() => api.post('/api/contacts', { user_id: peer.id }), 'Adicionado aos contatos.')}>
                  <UserIcon size={16} /> Adicionar aos contatos
                </Button>
              ))}
              {!isBot && (isBlocked ? (
                <Button variant="ghost" onClick={() => action(() => api.delete('/api/contacts/block', { user_id: peer.id }), 'Desbloqueado.')}>
                  <ShieldIcon size={16} /> Desbloquear
                </Button>
              ) : (
                <Button variant="ghost" danger onClick={() => action(() => api.post('/api/contacts/block', { user_id: peer.id }), 'Usuário bloqueado.')}>
                  <ShieldIcon size={16} /> Bloquear
                </Button>
              ))}
              {!isBot && (
                <Button variant="ghost" danger onClick={async () => {
                  const reason = prompt('Motivo da denúncia:');
                  if (!reason) return;
                  await action(() => api.post('/api/reports', { target_type: 'user', target_id: peer.id, reason }), 'Denúncia enviada.');
                }}>
                  <FlagIcon size={16} /> Denunciar
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {confirmClear ? (
        <div className={styles.confirmCard} role="alertdialog" aria-modal="true">
          <p className={styles.confirmText}>
            {isBot
              ? `Apagar tudo dessa conversa? ${peer?.name || 'O bot'} vai perder a memória do que vocês conversaram e começa do zero.`
              : 'Apagar todo o histórico dessa conversa? Esta ação não pode ser desfeita.'}
          </p>
          <div className={styles.confirmActions}>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>Cancelar</Button>
            <Button danger onClick={clearConversation}>Apagar</Button>
          </div>
        </div>
      ) : null}

      {/* Lightbox da foto de perfil. Carregado on-demand. */}
      {avatarBig && chatAvatarSrc ? (
        <Lightbox
          open
          items={[{
            kind: 'image',
            src: chatAvatarSrc.startsWith('http') ? chatAvatarSrc : `/api/files/${chatAvatarSrc}`,
            name: chat?.name || 'Avatar',
          }]}
          index={0}
          onClose={() => setAvatarBig(false)}
        />
      ) : null}
    </>
  );

  if (inline) {
    if (!open) return null;
    return (
      <div className={styles.inlineWrap}>
        <div className={styles.inlineHeader}>
          <h3 className={styles.inlineTitle}>Informações</h3>
          <button type="button" className={styles.inlineClose} onClick={onClose} aria-label="Fechar">
            <XIcon size={16} />
          </button>
        </div>
        <div className={styles.inlineBody}>{panelContent}</div>
      </div>
    );
  }

  return (
    <Drawer open={open} onClose={onClose} side="right" width={380} title="Informações">
      {panelContent}
    </Drawer>
  );
}
