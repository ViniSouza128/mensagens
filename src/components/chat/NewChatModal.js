'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import Avatar from '@/components/ui/Avatar';
import { api } from '@/services/api';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import { useToast } from '@/components/ui/Toast';
import { XIcon, CheckIcon, UsersIcon, ImageIcon, ArrowLeftIcon } from '@/components/icons/Icons';
import styles from './NewChatModal.module.css';

// ── Modes ─────────────────────────────────────────────────────────────────────
// 'direct'         — default: find/start a 1-on-1 conversation
// 'group_members'  — step 1: pick group members
// 'group_info'     — step 2: name / description / avatar

export default function NewChatModal({ open, onClose }) {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = useState('direct');

  // ── Shared search state ───────────────────────────────────────
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [bots, setBots] = useState([]);
  const [ollamaAlive, setOllamaAlive] = useState(true);
  const [loading, setLoading] = useState(false);
  const dq = useDebouncedValue(q, 220);

  // ── Group-specific state ──────────────────────────────────────
  const [selected, setSelected] = useState([]); // [{id, name, avatar_path, username}]
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupAvatar, setGroupAvatar] = useState(null);   // storage_path after upload
  const [groupAvatarPreview, setGroupAvatarPreview] = useState(null);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef(null);

  // ── Reset on open/close ───────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setMode('direct');
    setQ(''); setResults([]);
    setSelected([]);
    setGroupName(''); setGroupDesc('');
    setGroupAvatar(null); setGroupAvatarPreview(null);
    api.get('/api/contacts').then(setContacts).catch(() => setContacts([]));
    // Carrega bots LLM (Ollama). Endpoint dedicado para evitar misturar com
    // resultados de busca; também devolve flag `ollama_alive` p/ aviso.
    api.get('/api/bots').then((r) => {
      setBots(Array.isArray(r?.bots) ? r.bots : []);
      setOllamaAlive(r?.ollama_alive !== false);
    }).catch(() => { setBots([]); setOllamaAlive(false); });
  }, [open]);

  // ── User search ───────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (!dq) { setResults([]); return; }
    setLoading(true);
    api.get(`/api/users?q=${encodeURIComponent(dq)}`)
      .then((r) => setResults(Array.isArray(r) ? r : []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [dq, open]);

  // ── Direct chat ───────────────────────────────────────────────
  async function startChat(userId) {
    try {
      const chat = await api.post('/api/chats/direct', { user_id: userId });
      onClose?.();
      router.push(`/chats/${chat.id}`);
      router.refresh();
    } catch (err) {
      const msg = err.code === 'requires_contact_request' || err.code === 'blocked_by_target'
        ? 'Esse usuário bloqueia mensagens de desconhecidos. Envie uma solicitação.'
        : 'Não foi possível iniciar a conversa.';
      toast(msg, { tone: 'warning' });
    }
  }

  async function sendRequest(userId) {
    try {
      await api.post('/api/contacts/requests', { user_id: userId });
      toast('Solicitação enviada.', { tone: 'success' });
    } catch { toast('Não foi possível enviar a solicitação.', { tone: 'danger' }); }
  }

  // ── Group member selection ────────────────────────────────────
  function toggleMember(u) {
    setSelected((prev) => {
      const exists = prev.find((m) => m.id === u.id);
      return exists ? prev.filter((m) => m.id !== u.id) : [...prev, u];
    });
  }

  function isSelected(uid) { return selected.some((m) => m.id === uid); }

  // ── Group avatar upload ───────────────────────────────────────
  async function handleAvatarFile(file) {
    if (!file) return;
    setGroupAvatarPreview(URL.createObjectURL(file));
    const form = new FormData();
    form.append('file', file);
    form.append('kindHint', 'image');
    try {
      const [res] = await api.upload('/api/uploads', form);
      setGroupAvatar(res.storage_path);
    } catch { toast('Erro ao enviar foto.', { tone: 'danger' }); setGroupAvatarPreview(null); }
  }

  // ── Create group ──────────────────────────────────────────────
  async function createGroup() {
    if (!groupName.trim()) { toast('Dê um nome ao grupo.', { tone: 'warning' }); return; }
    if (selected.length === 0) { toast('Adicione pelo menos um membro.', { tone: 'warning' }); return; }
    setCreating(true);
    try {
      const chat = await api.post('/api/chats/group', {
        name: groupName.trim(),
        description: groupDesc.trim() || null,
        avatar_path: groupAvatar || null,
        member_ids: selected.map((m) => m.id),
      });
      onClose?.();
      router.push(`/chats/${chat.id}`);
      router.refresh();
    } catch { toast('Não foi possível criar o grupo.', { tone: 'danger' }); }
    finally { setCreating(false); }
  }

  // ── Tab bar ───────────────────────────────────────────────────
  const list = dq ? results : contacts;

  const modalTitle = mode === 'group_info'
    ? 'Informações do grupo'
    : mode === 'group_members'
    ? 'Selecionar membros'
    : 'Nova conversa';

  return (
    <Modal open={open} onClose={onClose} title={null} width={520}>
      {/* ── Custom header with tabs / back button ── */}
      <div className={styles.modalHeader}>
        {mode !== 'direct' ? (
          <button type="button" className={styles.backBtn}
            onClick={() => setMode(mode === 'group_info' ? 'group_members' : 'direct')}
            aria-label="Voltar">
            <ArrowLeftIcon size={18} />
          </button>
        ) : null}
        <span className={styles.modalTitle}>{modalTitle}</span>
        {mode === 'direct' && (
          <div className={styles.modeTabs}>
            <button type="button"
              className={[styles.modeTab, mode === 'direct' ? styles.modeTabActive : ''].join(' ')}
              onClick={() => setMode('direct')}>
              Conversa
            </button>
            <button type="button"
              className={[styles.modeTab, mode !== 'direct' ? styles.modeTabActive : ''].join(' ')}
              onClick={() => { setMode('group_members'); setQ(''); setResults([]); }}>
              <UsersIcon size={14} /> Grupo
            </button>
          </div>
        )}
        {mode === 'group_members' && selected.length > 0 && (
          <button type="button" className={styles.nextBtn} onClick={() => setMode('group_info')}>
            Próximo
          </button>
        )}
      </div>

      {/* ════════════════ DIRECT MODE ════════════════ */}
      {mode === 'direct' && (
        <>
          <Input placeholder="Buscar por nome, usuário ou e-mail" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="Buscar pessoas" autoFocus />
          <div className={styles.list}>
            {/* Bots LLM — só aparecem quando NÃO há busca ativa. Quando o
                usuário digita, a busca normal cobre bots junto com humanos. */}
            {!dq && bots.length > 0 && (
              <>
                <div className={styles.sectionTitle}>Bots AI (Ollama local)</div>
                {!ollamaAlive && (
                  <div className={styles.botWarn}>
                    Ollama não está respondendo em <code>127.0.0.1:11434</code>. Bots podem demorar ou falhar.
                  </div>
                )}
                {bots.map((u) => (
                  <div key={u.id} className={styles.row}>
                    <Avatar name={u.name} src={u.avatar_path} size={40} />
                    <div className={styles.info}>
                      <div className={styles.name}>
                        {u.name || u.username}
                        <span className={styles.botBadge} title={u.bot_model || 'modelo local'}>AI</span>
                      </div>
                      <div className={styles.botMeta}>{u.bot_tagline || u.bot_model}</div>
                    </div>
                    <div className={styles.actions}>
                      <button className={styles.primary} onClick={() => startChat(u.id)}>Conversar</button>
                    </div>
                  </div>
                ))}
                {contacts.length > 0 && <div className={styles.sectionTitle}>Contatos</div>}
              </>
            )}
            {loading && <div className={styles.empty}><span className={styles.hint}>Buscando…</span></div>}
            {!loading && list.length === 0 && (
              <div className={styles.empty}>
                <p className={styles.hint}>{dq ? 'Nenhum resultado.' : (bots.length ? 'Você ainda não tem contatos humanos. Use a busca acima.' : 'Você ainda não tem contatos. Use a busca acima.')}</p>
              </div>
            )}
            {list.map((u) => (
              <div key={u.id} className={styles.row}>
                <Avatar name={u.name} src={u.avatar_path} size={40} />
                <div className={styles.info}>
                  <div className={styles.name}>
                    {u.name || u.username}
                    {u.is_bot ? <span className={styles.botBadge} title={u.bot_model || 'modelo local'}>AI</span> : null}
                  </div>
                  <div className={styles.handle}>{u.is_bot ? (u.bot_tagline || u.bot_model) : `@${u.username}`}</div>
                </div>
                <div className={styles.actions}>
                  <button className={styles.primary} onClick={() => startChat(u.id)}>Conversar</button>
                  {dq && !u.is_bot && <button className={styles.ghost} onClick={() => sendRequest(u.id)}>Solicitar</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ════════════════ GROUP MEMBERS MODE ════════════════ */}
      {mode === 'group_members' && (
        <>
          {/* Selected chips */}
          {selected.length > 0 && (
            <div className={styles.chips}>
              {selected.map((m) => (
                <span key={m.id} className={styles.chip}>
                  <Avatar name={m.name} src={m.avatar_path} size={20} />
                  {m.name}
                  <button type="button" className={styles.chipRemove} onClick={() => toggleMember(m)} aria-label={`Remover ${m.name}`}>
                    <XIcon size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <Input placeholder="Buscar pessoas para adicionar" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="Buscar membros" autoFocus />

          <div className={styles.list}>
            {loading && <div className={styles.empty}><span className={styles.hint}>Buscando…</span></div>}
            {(() => {
              // Bots não podem entrar em grupos — backend rejeita explicitamente
              // (POST /api/chats/group → bots_cannot_join_groups). Filtra aqui
              // pra nem mostrar como opção de seleção. Veja
              // src/app/api/chats/group/route.js.
              const filtered = list.filter((u) => !u.is_bot);
              if (!loading && filtered.length === 0) {
                return (
                  <div className={styles.empty}>
                    <p className={styles.hint}>{dq ? 'Nenhum resultado de humanos (bots não entram em grupos).' : 'Use a busca para encontrar pessoas.'}</p>
                  </div>
                );
              }
              return filtered.map((u) => {
                const sel = isSelected(u.id);
                return (
                  <div key={u.id} className={[styles.row, styles.rowClickable, sel ? styles.rowSelected : ''].join(' ')}
                    onClick={() => toggleMember(u)} role="checkbox" aria-checked={sel} tabIndex={0}
                    onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') toggleMember(u); }}>
                    <Avatar name={u.name} src={u.avatar_path} size={40} />
                    <div className={styles.info}>
                      <div className={styles.name}>{u.name || u.username}</div>
                      <div className={styles.handle}>@{u.username}</div>
                    </div>
                    <span className={[styles.checkCircle, sel ? styles.checkCircleOn : ''].join(' ')}>
                      {sel && <CheckIcon size={13} />}
                    </span>
                  </div>
                );
              });
            })()}
          </div>

          {selected.length > 0 && (
            <div className={styles.footer}>
              <span className={styles.footerHint}>{selected.length} selecionado{selected.length > 1 ? 's' : ''}</span>
              <button type="button" className={styles.primary} onClick={() => setMode('group_info')}>
                Próximo →
              </button>
            </div>
          )}
        </>
      )}

      {/* ════════════════ GROUP INFO MODE ════════════════ */}
      {mode === 'group_info' && (
        <div className={styles.groupInfoPane}>
          {/* Avatar picker */}
          <label className={styles.avatarPicker} title="Foto do grupo">
            {groupAvatarPreview
              ? <img src={groupAvatarPreview} alt="Foto do grupo" className={styles.avatarPreview} />
              : <div className={styles.avatarPlaceholder}><ImageIcon size={28} /></div>}
            <span className={styles.avatarPick}>{groupAvatarPreview ? 'Alterar' : 'Adicionar foto'}</span>
            <input type="file" accept="image/*" className={styles.hiddenFile} ref={fileRef}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = ''; }} />
          </label>

          {/* Group name */}
          <div className={styles.groupField}>
            <label className={styles.groupLabel}>Nome do grupo *</label>
            <Input placeholder="Nome do grupo" value={groupName} autoFocus maxLength={80}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createGroup(); }} />
          </div>

          {/* Description */}
          <div className={styles.groupField}>
            <label className={styles.groupLabel}>Descrição <span className={styles.optional}>(opcional)</span></label>
            <textarea className={styles.groupTextarea} placeholder="Sobre este grupo…"
              value={groupDesc} onChange={(e) => setGroupDesc(e.target.value)}
              rows={3} maxLength={500} />
          </div>

          {/* Members preview */}
          <div className={styles.membersSummary}>
            <span className={styles.membersLabel}>{selected.length + 1} participantes</span>
            <div className={styles.avatarStack}>
              {selected.slice(0, 5).map((m) => (
                <Avatar key={m.id} name={m.name} src={m.avatar_path} size={26} />
              ))}
              {selected.length > 5 && (
                <span className={styles.moreCount}>+{selected.length - 5}</span>
              )}
            </div>
          </div>

          <button type="button" className={styles.createBtn} disabled={creating || !groupName.trim()}
            onClick={createGroup}>
            {creating ? 'Criando…' : 'Criar grupo'}
          </button>
        </div>
      )}
    </Modal>
  );
}
