'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/services/api';
import { useApp } from '@/store/AppStateProvider';
import { useToast } from '@/components/ui/Toast';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Tabs from '@/components/ui/Tabs';
import { formatRelative } from '@/lib/time';
import styles from './requests.module.css';

export default function RequestsPage() {
  const { refreshRequests } = useApp();
  const { toast } = useToast();
  const [tab, setTab] = useState('incoming');
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);

  async function load() {
    try {
      const [i, o] = await Promise.all([
        api.get('/api/contacts/requests?direction=incoming'),
        api.get('/api/contacts/requests?direction=outgoing'),
      ]);
      setIncoming(i || []);
      setOutgoing(o || []);
    } catch { /* noop */ }
  }
  useEffect(() => { load(); }, []);

  async function respond(req, accept) {
    try {
      await api.patch('/api/contacts/requests', { request_id: req.id, accept });
      toast(accept ? 'Solicitação aceita.' : 'Solicitação recusada.', { tone: 'success' });
      load();
      refreshRequests();
    } catch { toast('Falha.', { tone: 'danger' }); }
  }

  async function ignore(req) {
    try {
      await api.patch('/api/contacts/requests', { request_id: req.id, action: 'ignore' });
      load();
      refreshRequests();
    } catch { toast('Falha.', { tone: 'danger' }); }
  }

  async function blockSender(req) {
    if (!confirm(`Bloquear ${req.name || req.username}?`)) return;
    try {
      await api.patch('/api/contacts/requests', { request_id: req.id, action: 'block' });
      toast('Usuário bloqueado.', { tone: 'success' });
      load();
      refreshRequests();
    } catch { toast('Falha.', { tone: 'danger' }); }
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className="h1">Solicitações de contato</h1>
        <p className="muted small">
          Pessoas fora dos seus contatos podem solicitar conversa. Você decide quando responder.
        </p>
      </header>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'incoming', label: `Recebidas (${incoming.length})` },
          { value: 'outgoing', label: `Enviadas (${outgoing.length})` },
        ]}
      />

      {tab === 'incoming' ? (
        incoming.length === 0 ? (
          <Empty msg="Nenhuma solicitação recebida." />
        ) : (
          <ul className={styles.list}>
            {incoming.map((r) => (
              <li key={r.id} className={styles.item}>
                {/* API returns flat fields: r.username, r.name, r.avatar_path */}
                <Link href={`/profile/${r.username}`} className={styles.identity}>
                  <Avatar name={r.name} src={r.avatar_path} size={44} />
                  <div className={styles.body}>
                    <div className={styles.name}>{r.name || r.username}</div>
                    <div className={styles.username}>@{r.username} · {formatRelative(r.created_at)}</div>
                    {r.message ? <div className={styles.msg}>"{r.message}"</div> : null}
                  </div>
                </Link>
                <div className={styles.actions}>
                  <Button onClick={() => respond(r, true)}>Aceitar</Button>
                  <Button variant="ghost" danger onClick={() => respond(r, false)}>Recusar</Button>
                  <Button variant="ghost" onClick={() => ignore(r)}>Ignorar</Button>
                  <Button variant="ghost" danger onClick={() => blockSender(r)}>Bloquear</Button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (
        outgoing.length === 0 ? (
          <Empty msg="Você não enviou solicitações." />
        ) : (
          <ul className={styles.list}>
            {outgoing.map((r) => (
              <li key={r.id} className={styles.item}>
                <Link href={`/profile/${r.username}`} className={styles.identity}>
                  <Avatar name={r.name} src={r.avatar_path} size={44} />
                  <div className={styles.body}>
                    <div className={styles.name}>{r.name || r.username}</div>
                    <div className={styles.username}>@{r.username} · {formatRelative(r.created_at)}</div>
                    {r.message ? <div className={styles.msg}>"{r.message}"</div> : null}
                  </div>
                </Link>
                <span className={[styles.status, styles[`status_${r.status}`]].join(' ')}>{statusLabel(r.status)}</span>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function statusLabel(s) {
  if (s === 'pending') return 'Pendente';
  if (s === 'accepted') return 'Aceita';
  if (s === 'rejected') return 'Recusada';
  if (s === 'ignored') return 'Ignorada';
  return s;
}

function Empty({ msg }) { return <div className={styles.empty}><p className="muted">{msg}</p></div>; }
