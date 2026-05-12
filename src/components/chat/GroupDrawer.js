'use client';
import { useEffect, useRef, useState } from 'react';
import Avatar from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/services/api';
import { formatRelative } from '@/lib/time';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import {
  XIcon, SearchIcon, BellIcon, BellOffIcon, PinIcon, EditIcon, CheckIcon,
  UserPlusIcon, UserMinusIcon, ShieldIcon, CrownIcon, TrashIcon, LogoutIcon,
  CopyIcon, ImageIcon, FileIcon, LinkIcon, StarIcon, ChevronDownIcon,
  MoreIcon, DownloadIcon, VideoIcon, MicIcon,
} from '@/components/icons/Icons';
import styles from './GroupDrawer.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

const ROLE_LABEL = { owner: 'Dono', admin: 'Admin', member: '' };
const TABS = [
  { id: 'info',  label: 'Info' },
  { id: 'media', label: 'Mídia' },
  { id: 'links', label: 'Links' },
  { id: 'docs',  label: 'Docs' },
  { id: 'stars', label: '★' },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function GroupDrawer({ open, onClose, chat, me, onChange, onSearchInChat, inline }) {
  const { toast } = useToast();
  const [tab, setTab] = useState('info');
  const [busy, setBusy] = useState(false);

  // Inline editing
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [descInput, setDescInput] = useState('');

  // Tab data (lazy)
  const [mediaKind, setMediaKind] = useState('visual');
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaHasMore, setMediaHasMore] = useState(false);
  const [mediaOffset, setMediaOffset] = useState(0);
  const [linksItems, setLinksItems] = useState([]);
  const [linksHasMore, setLinksHasMore] = useState(false);
  const [docsItems, setDocsItems] = useState([]);
  const [docsHasMore, setDocsHasMore] = useState(false);
  const [starsItems, setStarsItems] = useState([]);
  const [starsHasMore, setStarsHasMore] = useState(false);

  const loaded = useRef(new Set());

  // Derived permissions
  const myRole = chat?.my_role || 'member';
  const isAdmin = myRole === 'admin' || myRole === 'owner';
  const isOwner = myRole === 'owner';
  const settings = chat?.group_settings || {};
  const members = chat?.members || [];
  const canEditInfo = isAdmin || settings.edit_info !== 'admins';
  const canAddMembers = isAdmin || settings.add_members !== 'admins';
  const showInviteLink = settings.invite_link_enabled &&
    (settings.invite_link_visible !== 'admins' || isAdmin);
  const inviteUrl = settings.invite_token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${settings.invite_token}`
    : null;

  // Clear tab data only when the chat itself changes (not on every open/close).
  // This keeps thumbnails and lists cached while the drawer is toggled,
  // avoiding redundant API calls when the user repeatedly opens/closes it.
  useEffect(() => {
    loaded.current = new Set();
    setMediaItems([]); setLinksItems([]); setDocsItems([]); setStarsItems([]);
    setMediaOffset(0);
  }, [chat?.id]);

  // Reset UI state (selected tab, inline editors) when the drawer closes
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setTab('info');
        setEditingName(false);
        setEditingDesc(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (chat) { setNameInput(chat.name || ''); setDescInput(chat.description || ''); }
  }, [chat?.id, chat?.name, chat?.description]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  // Lazy-load tab content
  useEffect(() => {
    if (!open || !chat?.id) return;
    const key = `media_${mediaKind}`;
    if (tab === 'media' && !loaded.current.has(key)) {
      loaded.current.add(key);
      api.get(`/api/chats/${chat.id}/media?kind=${mediaKind}&limit=30`)
        .then((r) => { setMediaItems(r?.items || []); setMediaHasMore(!!r?.hasMore); setMediaOffset(0); })
        .catch(() => {});
    }
    if (tab === 'links' && !loaded.current.has('links')) {
      loaded.current.add('links');
      api.get(`/api/chats/${chat.id}/links?limit=20`)
        .then((r) => { setLinksItems(r?.items || []); setLinksHasMore(!!r?.hasMore); })
        .catch(() => {});
    }
    if (tab === 'docs' && !loaded.current.has('docs')) {
      loaded.current.add('docs');
      api.get(`/api/chats/${chat.id}/media?kind=doc&limit=20`)
        .then((r) => { setDocsItems(r?.items || []); setDocsHasMore(!!r?.hasMore); })
        .catch(() => {});
    }
    if (tab === 'stars' && !loaded.current.has('stars')) {
      loaded.current.add('stars');
      api.get(`/api/chats/${chat.id}/stars?limit=20`)
        .then((r) => { setStarsItems(r?.items || []); setStarsHasMore(!!r?.hasMore); })
        .catch(() => {});
    }
  }, [tab, mediaKind, open, chat?.id]);

  // ── Action wrapper — returns true on success, false on error ─────────────────
  async function doAction(fn, successMsg) {
    if (busy) return false;
    setBusy(true);
    try {
      await fn();
      if (successMsg) toast(successMsg, { tone: 'success' });
      onChange?.();
      return true;
    } catch (err) {
      const msg = {
        requires_admin: 'Sem permissão de administrador.',
        requires_owner: 'Apenas o dono pode fazer isso.',
        only_owner_can_remove_admin: 'Apenas o dono pode remover admins.',
        only_owner_can_demote_admin: 'Apenas o dono pode rebaixar admins.',
        owner_must_transfer_or_delete: 'Transfira a posse ou apague o grupo antes de sair.',
        cannot_remove_owner: 'Não é possível remover o dono.',
        already_member: 'Usuário já é membro.',
      }[err.code] || 'Não foi possível concluir.';
      toast(msg, { tone: 'danger' });
      return false;
    } finally { setBusy(false); }
  }

  // ── Avatar upload ───────────────────────────────────────────────────────────
  async function uploadAvatar(file) {
    const form = new FormData();
    form.append('file', file);
    form.append('kindHint', 'image');
    try {
      const [res] = await api.upload('/api/uploads', form);
      await api.patch(`/api/chats/${chat.id}/info`, { avatar_path: res.storage_path });
      toast('Foto atualizada.', { tone: 'success' });
      onChange?.();
    } catch { toast('Erro ao enviar foto.', { tone: 'danger' }); }
  }

  if (!open || !chat) return null;

  return (
    <>
      {/* Overlay — hidden in inline mode */}
      {!inline && (
        <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }} />
      )}

      {/* Drawer panel */}
      <aside
        className={[styles.panel, inline ? styles.panelInline : ''].join(' ')}
        role={inline ? undefined : 'dialog'}
        aria-modal={inline ? undefined : 'true'}
        aria-label="Informações do grupo"
      >

        {/* ── Top bar ─────────────────────────────────────────── */}
        <div className={styles.topBar}>
          <span className={styles.topTitle}>Informações do grupo</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
            <XIcon size={18} />
          </button>
        </div>

        {/* ── Profile header ───────────────────────────────────── */}
        <div className={styles.profileHead}>
          {/* Avatar */}
          <label className={canEditInfo ? styles.avatarWrap : styles.avatarWrapStatic}
            title={canEditInfo ? 'Alterar foto do grupo' : undefined}>
            <Avatar name={chat.name} src={chat.avatar_path} size={80} />
            {canEditInfo && (
              <>
                <span className={styles.avatarOverlay} aria-hidden>📷</span>
                <input type="file" accept="image/*" className={styles.hiddenFileInput}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ''; }} />
              </>
            )}
          </label>

          {/* Name */}
          {editingName ? (
            <div className={styles.editRow}>
              <input className={styles.editInput} value={nameInput} autoFocus maxLength={80}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { if (!nameInput.trim()) return; doAction(() => api.patch(`/api/chats/${chat.id}/info`, { name: nameInput.trim() }), null).then(() => setEditingName(false)); }
                  if (e.key === 'Escape') { setEditingName(false); setNameInput(chat.name || ''); }
                }} />
              <button type="button" className={styles.iconBtn} onClick={() => {
                if (!nameInput.trim()) { toast('O nome não pode ficar vazio.', { tone: 'warning' }); return; }
                doAction(() => api.patch(`/api/chats/${chat.id}/info`, { name: nameInput.trim() }), null)
                  .then(() => setEditingName(false));
              }}><CheckIcon size={15} /></button>
              <button type="button" className={styles.iconBtn} onClick={() => { setEditingName(false); setNameInput(chat.name || ''); }}>
                <XIcon size={15} />
              </button>
            </div>
          ) : (
            <div className={styles.nameRow}>
              <h2 className={styles.chatName}>{chat.name || 'Grupo'}</h2>
              {canEditInfo && (
                <button type="button" className={styles.iconBtnMuted} onClick={() => setEditingName(true)} aria-label="Editar nome">
                  <EditIcon size={14} />
                </button>
              )}
            </div>
          )}

          <p className={styles.memberCountLabel}>
            {chat.member_count || members.length} participante{(chat.member_count || members.length) === 1 ? '' : 's'}
          </p>

          {/* Description */}
          {editingDesc ? (
            <div className={styles.editDescBlock}>
              <textarea className={styles.editTextarea} value={descInput} autoFocus rows={3} maxLength={500}
                onChange={(e) => setDescInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setEditingDesc(false); setDescInput(chat.description || ''); } }} />
              <div className={styles.editDescActions}>
                <button type="button" className={styles.saveBtn}
                  onClick={() => doAction(() => api.patch(`/api/chats/${chat.id}/info`, { description: descInput.trim() }), null).then(() => setEditingDesc(false))}>
                  Salvar
                </button>
                <button type="button" className={styles.cancelBtn}
                  onClick={() => { setEditingDesc(false); setDescInput(chat.description || ''); }}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.descRow} role={canEditInfo ? 'button' : undefined}
              tabIndex={canEditInfo ? 0 : undefined}
              onClick={canEditInfo ? () => setEditingDesc(true) : undefined}
              onKeyDown={canEditInfo ? (e) => { if (e.key === 'Enter') setEditingDesc(true); } : undefined}>
              {chat.description
                ? <p className={styles.desc}>{chat.description}</p>
                : canEditInfo ? <p className={styles.descPlaceholder}>Adicionar descrição…</p> : null}
              {canEditInfo && <EditIcon size={13} className={styles.descEditIcon} />}
            </div>
          )}

          {/* Quick actions */}
          <div className={styles.quickActions}>
            <button type="button" className={styles.qaBtn} onClick={() => { onClose?.(); onSearchInChat?.(); }}>
              <SearchIcon size={18} /><span>Buscar</span>
            </button>
            <button type="button"
              className={[styles.qaBtn, chat.muted ? styles.qaActive : ''].join(' ')}
              onClick={() => doAction(
                () => api.patch(`/api/chats/${chat.id}/state`, { muted_until: chat.muted ? null : Date.now() + 8 * 3_600_000 }),
                chat.muted ? 'Notificações ativadas.' : 'Grupo silenciado.'
              )}>
              {chat.muted ? <BellIcon size={18} /> : <BellOffIcon size={18} />}
              <span>{chat.muted ? 'Ativar' : 'Silenciar'}</span>
            </button>
            <button type="button"
              className={[styles.qaBtn, chat.pinned ? styles.qaActive : ''].join(' ')}
              onClick={() => doAction(
                () => api.patch(`/api/chats/${chat.id}/state`, { pinned: !chat.pinned }),
                chat.pinned ? 'Conversa desafixada.' : 'Conversa fixada.'
              )}>
              <PinIcon size={18} /><span>{chat.pinned ? 'Soltar' : 'Fixar'}</span>
            </button>
          </div>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────── */}
        <div className={styles.tabs} role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
              className={[styles.tabBtn, tab === t.id ? styles.tabActive : ''].join(' ')}
              onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Scrollable content ───────────────────────────────── */}
        <div className={styles.body}>
          {tab === 'info' && (
            <InfoTab
              chat={chat} me={me} myRole={myRole} isAdmin={isAdmin} isOwner={isOwner}
              canAddMembers={canAddMembers} settings={settings}
              showInviteLink={showInviteLink} inviteUrl={inviteUrl}
              busy={busy} doAction={doAction} toast={toast}
              onChange={onChange} onClose={onClose}
            />
          )}
          {tab === 'media' && (
            <MediaTab chatId={chat.id} kind={mediaKind}
              onKindChange={(k) => { setMediaKind(k); loaded.current.delete(`media_${k}`); setMediaItems([]); setMediaOffset(0); }}
              items={mediaItems} hasMore={mediaHasMore}
              onLoadMore={async () => {
                const newOffset = mediaOffset + 30;
                const r = await api.get(`/api/chats/${chat.id}/media?kind=${mediaKind}&limit=30&offset=${newOffset}`).catch(() => null);
                if (r) { setMediaItems((p) => [...p, ...(r.items || [])]); setMediaHasMore(!!r.hasMore); setMediaOffset(newOffset); }
              }}
            />
          )}
          {tab === 'links' && (
            <LinksTab items={linksItems} hasMore={linksHasMore}
              onLoadMore={async () => {
                const r = await api.get(`/api/chats/${chat.id}/links?limit=20&offset=${linksItems.length}`).catch(() => null);
                if (r) { setLinksItems((p) => [...p, ...(r.items || [])]); setLinksHasMore(!!r.hasMore); }
              }}
            />
          )}
          {tab === 'docs' && (
            <DocsTab items={docsItems} hasMore={docsHasMore}
              onLoadMore={async () => {
                const r = await api.get(`/api/chats/${chat.id}/media?kind=doc&limit=20&offset=${docsItems.length}`).catch(() => null);
                if (r) { setDocsItems((p) => [...p, ...(r.items || [])]); setDocsHasMore(!!r.hasMore); }
              }}
            />
          )}
          {tab === 'stars' && (
            <StarsTab items={starsItems} hasMore={starsHasMore}
              onLoadMore={async () => {
                const r = await api.get(`/api/chats/${chat.id}/stars?limit=20&offset=${starsItems.length}`).catch(() => null);
                if (r) { setStarsItems((p) => [...p, ...(r.items || [])]); setStarsHasMore(!!r.hasMore); }
              }}
            />
          )}
        </div>
      </aside>
    </>
  );
}

// ── InfoTab ───────────────────────────────────────────────────────────────────

function InfoTab({ chat, me, myRole, isAdmin, isOwner, canAddMembers, settings, showInviteLink, inviteUrl, busy, doAction, toast, onChange, onClose }) {
  const members = chat?.members || [];
  const [addSearch, setAddSearch] = useState('');
  const [addResults, setAddResults] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const dq = useDebouncedValue(addSearch, 220);

  useEffect(() => {
    if (!dq || !addOpen) { setAddResults([]); return; }
    setAddLoading(true);
    api.get(`/api/users?q=${encodeURIComponent(dq)}`)
      .then((r) => setAddResults(Array.isArray(r) ? r : []))
      .catch(() => setAddResults([]))
      .finally(() => setAddLoading(false));
  }, [dq, addOpen]);

  function copyInviteLink() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => toast('Link copiado.', { tone: 'success' })).catch(() => {});
  }

  return (
    <div>
      {/* ── Members section ───────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>{members.length} participante{members.length === 1 ? '' : 's'}</span>
          {canAddMembers && (
            <button type="button" className={styles.sectionAction} onClick={() => setAddOpen((v) => !v)}>
              <UserPlusIcon size={15} /> Adicionar
            </button>
          )}
        </div>

        {/* Inline add-member search */}
        {addOpen && (
          <div className={styles.addMemberPanel}>
            <input className={styles.addMemberInput} placeholder="Buscar usuário…" value={addSearch} autoFocus
              onChange={(e) => setAddSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setAddOpen(false); setAddSearch(''); } }} />
            {addLoading && <p className={styles.addMemberHint}>Buscando…</p>}
            {!addLoading && addResults.length === 0 && dq && <p className={styles.addMemberHint}>Nenhum resultado.</p>}
            {addResults.map((u) => {
              const alreadyMember = members.some((m) => m.user_id === u.id);
              return (
                <div key={u.id} className={styles.addMemberRow}>
                  <Avatar name={u.name} src={u.avatar_path} size={32} />
                  <span className={styles.addMemberName}>{u.name}</span>
                  {alreadyMember
                    ? <span className={styles.alreadyBadge}>já membro</span>
                    : (
                      <button type="button" className={styles.addBtn} disabled={busy}
                        onClick={() => doAction(() => api.post(`/api/chats/${chat.id}/members`, { user_id: u.id }), `${u.name} adicionado.`).then(() => { setAddOpen(false); setAddSearch(''); })}>
                        Adicionar
                      </button>
                    )}
                </div>
              );
            })}
          </div>
        )}

        {/* Member list */}
        <div className={styles.memberList}>
          {members.map((m) => {
            const isMe = m.user_id === me?.id;
            const targetRole = m.role || 'member';
            return (
              <MemberRow key={m.user_id} member={m} isMe={isMe}
                canManage={isAdmin && !isMe && targetRole !== 'owner'}
                canPromote={isOwner || (isAdmin && targetRole === 'member')}
                canDemote={isOwner && targetRole === 'admin'}
                canTransfer={isOwner}
                chatId={chat.id} busy={busy} doAction={doAction} onChange={onChange} />
            );
          })}
        </div>
      </div>

      {/* ── Settings section (admin only) ─────────────── */}
      {isAdmin && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Configurações do grupo</p>

          <SettingRow label="Editar informações" hint="Quem pode alterar nome, foto e descrição">
            <PillToggle
              value={settings.edit_info === 'admins' ? 'admins' : 'all'}
              options={[{ value: 'all', label: 'Todos' }, { value: 'admins', label: 'Só admins' }]}
              onChange={(v) => doAction(() => api.patch(`/api/chats/${chat.id}/settings`, { edit_info: v }), null)}
            />
          </SettingRow>

          <SettingRow label="Adicionar membros" hint="Quem pode adicionar novas pessoas">
            <PillToggle
              value={settings.add_members === 'admins' ? 'admins' : 'all'}
              options={[{ value: 'all', label: 'Todos' }, { value: 'admins', label: 'Só admins' }]}
              onChange={(v) => doAction(() => api.patch(`/api/chats/${chat.id}/settings`, { add_members: v }), null)}
            />
          </SettingRow>

          <SettingRow label="Link de convite" hint="Permite entrar no grupo por link">
            <button type="button"
              className={[styles.toggle, settings.invite_link_enabled ? styles.toggleOn : ''].join(' ')}
              onClick={() => doAction(() => api.patch(`/api/chats/${chat.id}/settings`, { invite_link_enabled: !settings.invite_link_enabled }), null)}
              aria-label={settings.invite_link_enabled ? 'Desativar link' : 'Ativar link'}
            >
              <span className={styles.toggleThumb} />
            </button>
          </SettingRow>

          {settings.invite_link_enabled && (
            <>
              <SettingRow label="Visibilidade do link" hint="Quem pode ver e usar o link">
                <PillToggle
                  value={settings.invite_link_visible === 'admins' ? 'admins' : 'all'}
                  options={[{ value: 'all', label: 'Todos' }, { value: 'admins', label: 'Só admins' }]}
                  onChange={(v) => doAction(() => api.patch(`/api/chats/${chat.id}/settings`, { invite_link_visible: v }), null)}
                />
              </SettingRow>

              {/* Invite link display */}
              {inviteUrl && (
                <div className={styles.inviteLinkBox}>
                  <span className={styles.inviteLinkUrl}>{inviteUrl}</span>
                  <button type="button" className={styles.inviteAction} onClick={copyInviteLink} aria-label="Copiar link">
                    <CopyIcon size={15} />
                  </button>
                  <button type="button" className={styles.inviteAction}
                    onClick={() => doAction(() => api.patch(`/api/chats/${chat.id}/settings`, { regenerate_invite: true }), 'Novo link gerado.')}
                    aria-label="Gerar novo link" title="Gerar novo link (invalida o anterior)">
                    ↺
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Invite link for non-admin (if visible) */}
      {!isAdmin && showInviteLink && inviteUrl && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Link de convite</p>
          <div className={styles.inviteLinkBox}>
            <span className={styles.inviteLinkUrl}>{inviteUrl}</span>
            <button type="button" className={styles.inviteAction} onClick={copyInviteLink} aria-label="Copiar link">
              <CopyIcon size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── Danger zone ───────────────────────────────── */}
      <div className={styles.danger}>
        {/* Limpar conversa: para grupos, é uma ação destrutiva (afeta TODOS),
            só admins/owner devem poder. Para não invasivo: deixo aberto a
            qualquer membro — o backend já valida membership. */}
        <DangerBtn icon={<TrashIcon size={16} />}
          onClick={async () => {
            if (!confirm('Apagar todo o histórico desta conversa? Esta ação afeta todos os membros e não pode ser desfeita.')) return;
            await doAction(() => api.post(`/api/chats/${chat.id}/clear`, {}), 'Conversa apagada.');
          }}>
          Limpar conversa
        </DangerBtn>
        {!isOwner && (
          <DangerBtn icon={<LogoutIcon size={16} />}
            onClick={async () => {
              if (!confirm('Sair do grupo?')) return;
              const ok = await doAction(() => api.post(`/api/chats/${chat.id}/leave`), 'Você saiu do grupo.');
              if (ok) onClose?.();
            }}>
            Sair do grupo
          </DangerBtn>
        )}
        {isOwner && (
          <DangerBtn icon={<TrashIcon size={16} />}
            onClick={async () => {
              if (!confirm('Apagar o grupo permanentemente? Esta ação não pode ser desfeita.')) return;
              const ok = await doAction(() => api.delete(`/api/chats/${chat.id}`), 'Grupo apagado.');
              if (ok) onClose?.();
            }}>
            Apagar grupo
          </DangerBtn>
        )}
      </div>
    </div>
  );
}

// ── MemberRow ─────────────────────────────────────────────────────────────────

function MemberRow({ member, isMe, canManage, canPromote, canDemote, canTransfer, chatId, busy, doAction, onChange }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef(null);
  const role = member.role || 'member';

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e) => { if (!ref.current?.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  return (
    <div className={styles.memberRow} ref={ref}>
      <Avatar name={member.name} src={member.avatar_path} size={36} online={!!member.online} />
      <div className={styles.memberInfo}>
        <span className={styles.memberName}>{member.name}{isMe ? ' (você)' : ''}</span>
        {member.username && <span className={styles.memberHandle}>@{member.username}</span>}
      </div>
      {role !== 'member' && (
        <span className={[styles.roleBadge, styles[`role_${role}`]].join(' ')}>
          {role === 'owner' ? <CrownIcon size={11} /> : <ShieldIcon size={11} />}
          {ROLE_LABEL[role]}
        </span>
      )}
      {canManage && (
        <div className={styles.memberMenuWrap}>
          <button type="button" className={styles.memberMenuBtn} onClick={() => setMenuOpen((v) => !v)} aria-label="Opções">
            <MoreIcon size={16} />
          </button>
          {menuOpen && (
            <div className={styles.memberMenu}>
              {canPromote && role === 'member' && (
                <button type="button" className={styles.memberMenuItem}
                  onClick={() => { setMenuOpen(false); doAction(() => api.patch(`/api/chats/${chatId}/members/${member.user_id}`, { role: 'admin' }), `${member.name} é admin agora.`); }}>
                  <ShieldIcon size={14} /> Tornar admin
                </button>
              )}
              {canDemote && role === 'admin' && (
                <button type="button" className={styles.memberMenuItem}
                  onClick={() => { setMenuOpen(false); doAction(() => api.patch(`/api/chats/${chatId}/members/${member.user_id}`, { role: 'member' }), `${member.name} não é mais admin.`); }}>
                  <UserMinusIcon size={14} /> Remover como admin
                </button>
              )}
              {canTransfer && (
                <button type="button" className={styles.memberMenuItem}
                  onClick={() => {
                    setMenuOpen(false);
                    if (!confirm(`Transferir a posse do grupo para ${member.name}? Você se tornará admin.`)) return;
                    doAction(() => api.patch(`/api/chats/${chatId}/members/${member.user_id}`, { transfer_ownership: true }), 'Posse transferida.');
                  }}>
                  <CrownIcon size={14} /> Transferir posse
                </button>
              )}
              <div className={styles.memberMenuDivider} />
              <button type="button" className={[styles.memberMenuItem, styles.memberMenuDanger].join(' ')}
                onClick={() => {
                  setMenuOpen(false);
                  if (!confirm(`Remover ${member.name} do grupo?`)) return;
                  doAction(() => api.delete(`/api/chats/${chatId}/members/${member.user_id}`), `${member.name} foi removido.`);
                }}>
                <UserMinusIcon size={14} /> Remover do grupo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── MediaTab ──────────────────────────────────────────────────────────────────

function MediaTab({ chatId, kind, onKindChange, items, hasMore, onLoadMore }) {
  const KINDS = [{ id: 'visual', label: 'Fotos e vídeos' }, { id: 'audio', label: 'Áudio' }, { id: 'doc', label: 'Docs' }];
  return (
    <div>
      <div className={styles.filterRow}>
        {KINDS.map((k) => (
          <button key={k.id} type="button" className={[styles.filterBtn, kind === k.id ? styles.filterActive : ''].join(' ')}
            onClick={() => onKindChange(k.id)}>{k.label}</button>
        ))}
      </div>
      {items.length === 0
        ? <EmptyState icon={<ImageIcon size={32} />} text="Nenhuma mídia nesta conversa." />
        : (kind === 'visual'
          ? (
            <div className={styles.mediaGrid}>
              {items.map((a) => (
                <a key={a.id} href={`/api/files/${a.storage_path}`} target="_blank" rel="noopener noreferrer" className={styles.mediaThumb}>
                  {a.thumb_path
                    ? <img src={`/api/files/${a.thumb_path}`} alt={a.filename || ''} loading="lazy" />
                    : <div className={styles.mediaThumbIcon}><VideoIcon size={20} /></div>}
                  {a.kind === 'video' && <span className={styles.mediaVideoBadge}>▶</span>}
                </a>
              ))}
            </div>
          )
          : (
            <div>
              {items.map((a) => (
                <a key={a.id} href={`/api/files/${a.storage_path}`} target="_blank" rel="noopener noreferrer" className={styles.docRow}>
                  <MicIcon size={18} className={styles.docIcon} />
                  <div className={styles.docInfo}>
                    <span className={styles.docName}>{a.filename || 'Áudio'}</span>
                    <span className={styles.docMeta}>{formatRelative(a.created_at)} · {formatBytes(a.size)}</span>
                  </div>
                  <DownloadIcon size={16} className={styles.docDl} />
                </a>
              ))}
            </div>
          )
        )}
      {hasMore && <LoadMoreBtn onClick={onLoadMore} />}
    </div>
  );
}

// ── LinksTab ──────────────────────────────────────────────────────────────────

function LinksTab({ items, hasMore, onLoadMore }) {
  if (items.length === 0) return <EmptyState icon={<LinkIcon size={32} />} text="Nenhum link compartilhado." />;
  return (
    <div>
      {items.map((m) => (
        <div key={m.id} className={styles.linkItem}>
          <div className={styles.linkMeta}>{m.sender_name} · {formatRelative(m.created_at)}</div>
          {m.urls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noopener noreferrer" className={styles.linkUrl}>{u}</a>
          ))}
          {m.body && m.body !== m.urls[0] && <p className={styles.linkSnippet}>{m.body.slice(0, 120)}</p>}
        </div>
      ))}
      {hasMore && <LoadMoreBtn onClick={onLoadMore} />}
    </div>
  );
}

// ── DocsTab ───────────────────────────────────────────────────────────────────

function DocsTab({ items, hasMore, onLoadMore }) {
  if (items.length === 0) return <EmptyState icon={<FileIcon size={32} />} text="Nenhum documento compartilhado." />;
  return (
    <div>
      {items.map((a) => (
        <a key={a.id} href={`/api/files/${a.storage_path}`} target="_blank" rel="noopener noreferrer"
          download={a.filename} className={styles.docRow}>
          <FileIcon size={20} className={styles.docIcon} />
          <div className={styles.docInfo}>
            <span className={styles.docName}>{a.filename || 'Arquivo'}</span>
            <span className={styles.docMeta}>{a.sender_name} · {formatRelative(a.created_at)} · {formatBytes(a.size)}</span>
          </div>
          <DownloadIcon size={16} className={styles.docDl} />
        </a>
      ))}
      {hasMore && <LoadMoreBtn onClick={onLoadMore} />}
    </div>
  );
}

// ── StarsTab ──────────────────────────────────────────────────────────────────

function StarsTab({ items, hasMore, onLoadMore }) {
  if (items.length === 0) return <EmptyState icon={<StarIcon size={32} />} text="Nenhuma mensagem favorita neste grupo." />;
  return (
    <div>
      {items.map((m) => (
        <div key={m.id} className={styles.starItem}>
          <div className={styles.starMeta}>
            <Avatar name={m.sender_name} src={m.sender_avatar} size={22} />
            <span className={styles.starSender}>{m.sender_name}</span>
            <span className={styles.starTime}>{formatRelative(m.created_at)}</span>
          </div>
          <p className={styles.starBody}>{m.body || `[${m.type}]`}</p>
        </div>
      ))}
      {hasMore && <LoadMoreBtn onClick={onLoadMore} />}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SettingRow({ label, hint, children }) {
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingText}>
        <span className={styles.settingLabel}>{label}</span>
        {hint && <span className={styles.settingHint}>{hint}</span>}
      </div>
      <div className={styles.settingControl}>{children}</div>
    </div>
  );
}

function PillToggle({ value, options, onChange }) {
  return (
    <div className={styles.pillToggle}>
      {options.map((o) => (
        <button key={o.value} type="button"
          className={[styles.pill, value === o.value ? styles.pillActive : ''].join(' ')}
          onClick={() => { if (value !== o.value) onChange(o.value); }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DangerBtn({ icon, children, onClick }) {
  return (
    <button type="button" className={styles.dangerBtn} onClick={onClick}>
      {icon}{children}
    </button>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}>{icon}</span>
      <span className={styles.emptyText}>{text}</span>
    </div>
  );
}

function LoadMoreBtn({ onClick }) {
  return (
    <button type="button" className={styles.loadMoreBtn} onClick={onClick}>
      <ChevronDownIcon size={14} /> Carregar mais
    </button>
  );
}
