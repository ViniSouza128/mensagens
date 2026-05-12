'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/Modal';
import { api } from '@/services/api';
import { useApp } from '@/store/AppStateProvider';
import { useToast } from '@/components/ui/Toast';
import Avatar from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import Tabs from '@/components/ui/Tabs';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import { formatRelative } from '@/lib/time';
import {
  SearchIcon, PlusIcon, ChatsIcon, ShieldIcon, XIcon, EditIcon, CheckIcon,
} from '@/components/icons/Icons';
import styles from './contacts.module.css';

export default function ContactsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { requestsCount, refreshRequests } = useApp();
  const [tab, setTab] = useState('contacts');
  const [contacts, setContacts] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [q, setQ] = useState('');
  const dq = useDebouncedValue(q, 150);
  const [results, setResults] = useState([]);
  const [editingAlias, setEditingAlias] = useState(null);
  const [aliasInput, setAliasInput] = useState('');
  const [removeTarget, setRemoveTarget] = useState(null);
  const [blockTarget, setBlockTarget] = useState(null);

  async function load() {
    try {
      const [c, b, req] = await Promise.all([
        api.get('/api/contacts'),
        api.get('/api/contacts/block'),
        api.get('/api/contacts/requests?direction=incoming'),
      ]);
      setContacts(c || []);
      setBlocked(b || []);
      setIncoming(req || []);
    } catch { /* noop */ }
  }
  useEffect(() => { load(); }, []);

  // User search for "add" tab
  useEffect(() => {
    if (tab !== 'add' || !dq) { setResults([]); return; }
    let cancel = false;
    api.get(`/api/users?q=${encodeURIComponent(dq)}`).then((r) => {
      if (!cancel) setResults(r || []);
    }).catch(() => {});
    return () => { cancel = true; };
  }, [dq, tab]);

  const filteredContacts = useMemo(() => {
    if (!q) return contacts;
    const t = q.toLowerCase();
    return contacts.filter((c) =>
      (c.alias || c.name || '').toLowerCase().includes(t) ||
      (c.name || '').toLowerCase().includes(t) ||
      (c.username || '').toLowerCase().includes(t)
    );
  }, [contacts, q]);

  async function add(u) {
    try {
      await api.post('/api/contacts', { user_id: u.id });
      toast('Contato adicionado.', { tone: 'success' });
      load();
      setQ('');
    } catch { toast('Não foi possível adicionar o contato.', { tone: 'danger' }); }
  }

  function remove(u) { setRemoveTarget(u); }

  async function doRemove() {
    const u = removeTarget;
    setRemoveTarget(null);
    try {
      await api.delete('/api/contacts', { user_id: u.id });
      toast('Contato removido.', { tone: 'success' });
      load();
    } catch { toast('Não foi possível remover o contato.', { tone: 'danger' }); }
  }

  async function unblock(u) {
    try {
      await api.delete('/api/contacts/block', { user_id: u.id });
      toast('Usuário desbloqueado.', { tone: 'success' });
      load();
    } catch { toast('Não foi possível desbloquear o usuário.', { tone: 'danger' }); }
  }

  async function startChat(u) {
    try {
      const c = await api.post('/api/chats/direct', { user_id: u.id });
      router.push(`/chats/${c.id}`);
    } catch (err) {
      toast(err.code === 'requires_contact_request' ? 'Solicitação enviada.' : 'Não foi possível iniciar conversa.', { tone: 'warning' });
    }
  }

  async function saveAlias(u) {
    try {
      await api.patch('/api/contacts', { user_id: u.id, alias: aliasInput.trim() || null });
      setContacts((prev) => prev.map((c) => c.id === u.id ? { ...c, alias: aliasInput.trim() || null } : c));
      setEditingAlias(null);
    } catch { toast('Falha ao salvar apelido.', { tone: 'danger' }); }
  }

  function startEditAlias(u) {
    setEditingAlias(u.id);
    setAliasInput(u.alias || '');
  }

  // Contact request actions
  async function respondRequest(req, accept) {
    try {
      await api.patch('/api/contacts/requests', { request_id: req.id, accept });
      toast(accept ? 'Solicitação aceita.' : 'Solicitação recusada.', { tone: 'success' });
      load();
      refreshRequests();
    } catch { toast('Não foi possível responder à solicitação.', { tone: 'danger' }); }
  }

  async function ignoreRequest(req) {
    try {
      await api.patch('/api/contacts/requests', { request_id: req.id, action: 'ignore' });
      load();
      refreshRequests();
    } catch { toast('Falha.', { tone: 'danger' }); }
  }

  function blockRequest(req) { setBlockTarget(req); }

  async function doBlockRequest() {
    const req = blockTarget;
    setBlockTarget(null);
    try {
      await api.patch('/api/contacts/requests', { request_id: req.id, action: 'block' });
      toast('Usuário bloqueado.', { tone: 'success' });
      load();
      refreshRequests();
    } catch { toast('Não foi possível bloquear o usuário.', { tone: 'danger' }); }
  }

  const requestsBadge = incoming.length || undefined;

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className="h1">Contatos</h1>
      </header>

      <Tabs
        value={tab}
        onChange={(v) => { setTab(v); setQ(''); }}
        items={[
          { value: 'contacts', label: 'Contatos', badge: contacts.length || null },
          { value: 'add', label: 'Adicionar' },
          { value: 'blocked', label: 'Bloqueados', badge: blocked.length || null },
          { value: 'requests', label: 'Solicitações', badge: requestsBadge },
        ]}
      />

      {tab !== 'requests' ? (
        <div className={styles.search}>
          <span className={styles.searchIcon}><SearchIcon size={16} /></span>
          <Input
            placeholder={tab === 'add' ? 'Buscar usuários por nome ou @user' : 'Filtrar lista'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
          {q ? <button type="button" className={styles.clear} onClick={() => setQ('')}><XIcon size={14} /></button> : null}
        </div>
      ) : null}

      {tab === 'contacts' ? (
        filteredContacts.length === 0 ? <Empty msg="Nenhum contato ainda. Use a aba Adicionar." /> : (
          <ul className={styles.list}>
            {filteredContacts.map((u) => (
              <li key={u.id} className={styles.item}>
                <Link href={`/profile/${u.username}`} className={styles.identity}>
                  <Avatar name={u.alias || u.name} src={u.avatar_path} size={44} online={u.online} />
                  <div className={styles.body}>
                    {editingAlias === u.id ? (
                      <div className={styles.aliasRow} onClick={(e) => e.preventDefault()}>
                        <input
                          className={styles.aliasInput}
                          value={aliasInput}
                          onChange={(e) => setAliasInput(e.target.value)}
                          placeholder={u.name || u.username}
                          maxLength={80}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveAlias(u);
                            if (e.key === 'Escape') setEditingAlias(null);
                          }}
                        />
                        <button type="button" className={styles.aliasBtn} onClick={() => saveAlias(u)} aria-label="Salvar"><CheckIcon size={13} /></button>
                        <button type="button" className={styles.aliasBtn} onClick={() => setEditingAlias(null)} aria-label="Cancelar"><XIcon size={13} /></button>
                      </div>
                    ) : (
                      <>
                        <div className={styles.name}>
                          {u.alias || u.name || u.username}
                          {u.alias && u.name && u.alias !== u.name
                            ? <span className={styles.realName}> ({u.name})</span>
                            : null}
                        </div>
                        <div className={styles.username}>@{u.username}{u.bio ? ` · ${u.bio}` : ''}</div>
                      </>
                    )}
                  </div>
                </Link>
                <div className={styles.actions}>
                  <IconButton label="Conversar" onClick={() => startChat(u)}><ChatsIcon /></IconButton>
                  <IconButton label="Editar apelido" onClick={() => startEditAlias(u)}><EditIcon /></IconButton>
                  <IconButton label="Remover" onClick={() => remove(u)}><XIcon /></IconButton>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : tab === 'add' ? (
        !dq ? <Empty msg="Digite para buscar usuários pelo nome ou @user." /> :
        results.length === 0 ? <Empty msg="Nenhum resultado." /> : (
          <ul className={styles.list}>
            {results.map((u) => (
              <li key={u.id} className={styles.item}>
                <Link href={`/profile/${u.username}`} className={styles.identity}>
                  <Avatar name={u.name} src={u.avatar_path} size={44} />
                  <div className={styles.body}>
                    <div className={styles.name}>{u.name || u.username}</div>
                    <div className={styles.username}>@{u.username}</div>
                  </div>
                </Link>
                <Button onClick={() => add(u)}><PlusIcon size={16} /> Adicionar</Button>
              </li>
            ))}
          </ul>
        )
      ) : tab === 'blocked' ? (
        blocked.length === 0 ? <Empty msg="Sem usuários bloqueados." /> : (
          <ul className={styles.list}>
            {blocked.map((u) => (
              <li key={u.id} className={styles.item}>
                <div className={styles.identity}>
                  <Avatar name={u.name} src={u.avatar_path} size={44} />
                  <div className={styles.body}>
                    <div className={styles.name}>{u.name || u.username}</div>
                    <div className={styles.username}>@{u.username}</div>
                  </div>
                </div>
                <Button variant="ghost" onClick={() => unblock(u)}>
                  <ShieldIcon size={16} /> Desbloquear
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : (
        // Requests tab
        incoming.length === 0 ? <Empty msg="Nenhuma solicitação pendente." /> : (
          <ul className={styles.list}>
            {incoming.map((r) => (
              <li key={r.id} className={[styles.item, styles.requestItem].join(' ')}>
                <Link href={`/profile/${r.username}`} className={styles.identity}>
                  <Avatar name={r.name} src={r.avatar_path} size={44} />
                  <div className={styles.body}>
                    <div className={styles.name}>{r.name || r.username}</div>
                    <div className={styles.username}>@{r.username} · {formatRelative(r.created_at)}</div>
                    {r.message ? <div className={styles.requestMsg}>"{r.message}"</div> : null}
                  </div>
                </Link>
                <div className={styles.requestActions}>
                  <Button onClick={() => respondRequest(r, true)}>Aceitar</Button>
                  <Button variant="ghost" danger onClick={() => respondRequest(r, false)}>Recusar</Button>
                  <Button variant="ghost" onClick={() => ignoreRequest(r)}>Ignorar</Button>
                  <button
                    type="button"
                    className={styles.blockBtn}
                    onClick={() => blockRequest(r)}
                    title="Bloquear este usuário"
                  >
                    <ShieldIcon size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}
      <Modal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="Remover contato"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>Cancelar</Button>
            <Button danger onClick={doRemove}>Remover</Button>
          </>
        }
      >
        <p>Remover <strong>{removeTarget?.alias || removeTarget?.name || removeTarget?.username}</strong> dos seus contatos?</p>
      </Modal>

      <Modal
        open={!!blockTarget}
        onClose={() => setBlockTarget(null)}
        title="Bloquear usuário"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBlockTarget(null)}>Cancelar</Button>
            <Button danger onClick={doBlockRequest}>Bloquear</Button>
          </>
        }
      >
        <p>Bloquear <strong>{blockTarget?.name || blockTarget?.username}</strong>? Este usuário não poderá mais te enviar mensagens ou solicitações.</p>
      </Modal>
    </div>
  );
}

function Empty({ msg }) {
  return <div className={styles.empty}><p className="muted">{msg}</p></div>;
}
