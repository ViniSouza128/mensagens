'use client';
import { useEffect, useState, useCallback, Fragment } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/services/api';
import { useApp } from '@/store/AppStateProvider';
import { useToast } from '@/components/ui/Toast';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Tabs from '@/components/ui/Tabs';
import Modal from '@/components/ui/Modal';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import {
  SearchIcon, ShieldIcon, LockIcon, UnlockIcon,
  AlertTriangleIcon, RefreshIcon, TrashIcon,
} from '@/components/icons/Icons';
import Sparkline from '@/components/ui/Sparkline';
import styles from './admin.module.css';

// History buffer keyed by metric name — kept in module scope so it persists
// across tab switches within the session (cleared on full reload).
const SPARK_HISTORY = new Map();
const SPARK_MAX = 20;
function pushSpark(key, val) {
  const arr = SPARK_HISTORY.get(key) || [];
  if (arr[arr.length - 1] === val && arr.length > 0) return arr; // sem mudança não duplica
  const next = [...arr, val].slice(-SPARK_MAX);
  SPARK_HISTORY.set(key, next);
  return next;
}

const PAGE_SIZE = 50;

const TABS = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'users', label: 'Usuários' },
  { value: 'groups', label: 'Grupos' },
  { value: 'reports', label: 'Denúncias' },
  { value: 'audit', label: 'Auditoria' },
  { value: 'errors', label: 'Erros' },
];

/* ── helpers ──────────────────────────────────────────────── */

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-BR');
}
function fmtDateShort(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR');
}
function prettyJson(value) {
  if (typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  }
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

/* ── shared components ────────────────────────────────────── */

function FilterSelect({ value, onChange, children }) {
  return (
    <select value={value} onChange={onChange} className={styles.filterSelect}>
      {children}
    </select>
  );
}

function Pager({ page, setPage, hasMore }) {
  if (page === 0 && !hasMore) return null;
  return (
    <div className={styles.pager}>
      <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
        ← Anterior
      </Button>
      <span className={styles.muted}>Página {page + 1}</span>
      <Button size="sm" variant="ghost" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
        Próxima →
      </Button>
    </div>
  );
}

function ConfirmModal({ open, onClose, title, message, danger, onConfirm }) {
  if (!open) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button danger={danger} onClick={() => { onConfirm(); onClose(); }}>Confirmar</Button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}

/* ── page ─────────────────────────────────────────────────── */

export default function AdminPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const { user } = useApp();
  const [tab, _setTab] = useState(() => sp?.get('tab') || 'overview');

  // Persist tab in URL search params (deep-linkable)
  function setTab(t) {
    _setTab(t);
    const u = new URL(window.location.href);
    u.searchParams.set('tab', t);
    window.history.replaceState(null, '', u.pathname + u.search);
  }

  useEffect(() => {
    if (user && !user.is_admin) router.replace('/chats');
  }, [user, router]);

  if (!user) return <div className={styles.empty}>Carregando…</div>;
  if (!user.is_admin) return null;

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}><ShieldIcon size={20} /> Painel administrativo</h1>
          <p className={styles.pageSubtitle}>Ferramentas de moderação e diagnóstico.</p>
        </div>
      </header>
      <Tabs value={tab} onChange={setTab} items={TABS} />
      {tab === 'overview' && <OverviewTab onTabChange={setTab} />}
      {tab === 'users' && <UsersTab />}
      {tab === 'groups' && <GroupsTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'errors' && <ErrorsTab />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   OVERVIEW
   ════════════════════════════════════════════════════════════ */

function OverviewTab({ onTabChange }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    function load() {
      api.get('/api/admin/stats').then((s) => { if (alive) setStats(s); }).catch(() => {});
    }
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!stats) return <div className={styles.empty}>Carregando estatísticas…</div>;

  // Atualiza histórico para sparklines
  pushSpark('users', stats.usersTotal);
  pushSpark('messages', stats.messages);
  pushSpark('online', stats.onlineConnections);
  pushSpark('reports', stats.reportsOpen);
  pushSpark('errors', stats.errors24h);

  const cards = [
    { key: 'users', label: 'Usuários', value: stats.usersTotal, hint: `${stats.usersActive} ativos`, tab: 'users', spark: 'users' },
    { label: 'Admins', value: stats.usersAdmin, tab: 'users' },
    { label: 'Suspensos', value: stats.usersSuspended, warn: stats.usersSuspended > 0, tab: 'users' },
    { label: 'Banidos', value: stats.usersBanned, danger: stats.usersBanned > 0, tab: 'users' },
    { label: 'Grupos', value: stats.groups, tab: 'groups' },
    { label: 'Conversas totais', value: stats.chats },
    { label: 'Mensagens', value: stats.messages, hint: `${stats.messagesToday} hoje`, spark: 'messages' },
    { label: 'Denúncias abertas', value: stats.reportsOpen, warn: stats.reportsOpen > 0, tab: 'reports', spark: 'reports' },
    { label: 'Em análise', value: stats.reportsReviewing, tab: 'reports' },
    { label: 'Erros 24h', value: stats.errors24h, danger: stats.errors24h > 0, tab: 'errors', spark: 'errors' },
    { label: 'Conexões online', value: stats.onlineConnections, spark: 'online' },
  ];

  return (
    <div className={styles.statsGrid}>
      {cards.map((c) => (
        <div
          key={c.label}
          className={[
            styles.stat,
            c.tab ? styles.statClickable : '',
            c.danger ? styles.statDanger : c.warn ? styles.statWarn : '',
          ].join(' ')}
          onClick={c.tab ? () => onTabChange(c.tab) : undefined}
          role={c.tab ? 'button' : undefined}
          tabIndex={c.tab ? 0 : undefined}
          onKeyDown={c.tab ? (e) => { if (e.key === 'Enter') onTabChange(c.tab); } : undefined}
        >
          <div className={styles.statLabel}>{c.label}</div>
          <div className={styles.statValue}>{c.value ?? 0}</div>
          {c.hint ? <div className={styles.statHint}>{c.hint}</div> : null}
          {c.spark ? <Sparkline data={SPARK_HISTORY.get(c.spark) || []} width={88} height={22} /> : null}
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   USERS
   ════════════════════════════════════════════════════════════ */

function StatusBadges({ user }) {
  const out = [];
  if (user.is_admin) out.push(<span key="a" className={[styles.badge, styles.badgeAdmin].join(' ')}>Admin</span>);
  if (user.status === 'active') out.push(<span key="s" className={[styles.badge, styles.badgeActive].join(' ')}>Ativo</span>);
  else if (user.status === 'suspended') out.push(<span key="s" className={[styles.badge, styles.badgeSuspended].join(' ')}>Suspenso</span>);
  else if (user.status === 'banned') out.push(<span key="s" className={[styles.badge, styles.badgeBanned].join(' ')}>Banido</span>);
  else out.push(<span key="s" className={styles.badge}>{user.status}</span>);
  return <div className={styles.badgeRow}>{out}</div>;
}

function SuspendModal({ user, onClose, onConfirm }) {
  const PRESETS = [
    { label: '1 dia', days: 1 },
    { label: '3 dias', days: 3 },
    { label: '7 dias', days: 7 },
    { label: '14 dias', days: 14 },
    { label: '30 dias', days: 30 },
    { label: 'Personalizado', days: null },
  ];
  const [sel, setSel] = useState(2); // default 7 days
  const [customDays, setCustomDays] = useState('');
  const [reason, setReason] = useState('');

  const days = PRESETS[sel].days ?? (Number.parseInt(customDays, 10) || 0);
  const until = days > 0 ? Date.now() + days * 86_400_000 : null;

  function confirm() {
    if (!until) return;
    onConfirm({ until, reason: reason.trim() || 'Suspensão manual' });
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Suspender @${user?.username}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button danger disabled={!until} onClick={confirm}>Confirmar suspensão</Button>
        </>
      }
    >
      <p className={styles.fieldLabel} style={{ marginBottom: 8 }}>Duração:</p>
      <div className={styles.presets}>
        {PRESETS.map((p, i) => (
          <button
            key={p.label}
            type="button"
            className={[styles.preset, sel === i ? styles.presetActive : ''].join(' ')}
            onClick={() => setSel(i)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {PRESETS[sel].days === null && (
        <div style={{ marginTop: 10 }}>
          <Input
            type="number"
            min="1"
            max="365"
            value={customDays}
            onChange={(e) => setCustomDays(e.target.value)}
            placeholder="Número de dias…"
          />
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <label className={styles.fieldLabel}>Motivo <span className={styles.optional}>(opcional)</span></label>
        <textarea
          className={styles.reasonInput}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Descreva o motivo da suspensão…"
          rows={3}
          maxLength={500}
        />
      </div>
      {until ? (
        <p className={styles.muted} style={{ marginTop: 8, fontSize: 12 }}>
          Suspenso até <strong>{fmtDate(until)}</strong>
        </p>
      ) : null}
    </Modal>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const sp = useSearchParams();
  const [q, setQ] = useState(() => sp?.get('q') || '');
  const [status, setStatus] = useState(() => sp?.get('status') || '');
  const [page, setPage] = useState(0);
  const dq = useDebouncedValue(q, 200);

  // Reflete filtros na URL — debounced para a busca
  useEffect(() => {
    const u = new URL(window.location.href);
    if (dq) u.searchParams.set('q', dq); else u.searchParams.delete('q');
    if (status) u.searchParams.set('status', status); else u.searchParams.delete('status');
    window.history.replaceState(null, '', u.pathname + u.search);
  }, [dq, status]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [suspendTarget, setSuspendTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (dq) p.set('q', dq);
      if (status) p.set('status', status);
      p.set('limit', String(PAGE_SIZE + 1));
      p.set('offset', String(page * PAGE_SIZE));
      const list = await api.get(`/api/admin/users?${p}`);
      setItems(Array.isArray(list) ? list : []);
    } catch { toast('Falha ao carregar usuários.', { tone: 'danger' }); }
    finally { setLoading(false); }
  }, [dq, status, page, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [dq, status]);

  async function act(action, target_id, extra = {}) {
    try {
      await api.post('/api/admin/users', { action, target_id, ...extra });
      toast('Ação aplicada.', { tone: 'success' });
      load();
    } catch { toast('Ação falhou.', { tone: 'danger' }); }
  }

  const displayed = items.slice(0, PAGE_SIZE);
  const hasMore = items.length > PAGE_SIZE;

  return (
    <>
      <div className={styles.section}>
        <div className={styles.sHead}>
          <div className={styles.search}>
            <SearchIcon size={16} className={styles.searchIcon} />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, @username ou email…"
              style={{ paddingLeft: 32 }}
            />
          </div>
          <FilterSelect value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="suspended">Suspensos</option>
            <option value="banned">Banidos</option>
          </FilterSelect>
          <Button size="sm" variant="ghost" onClick={load}><RefreshIcon size={14} /></Button>
        </div>

        {loading ? (
          <div className={styles.empty}>Carregando…</div>
        ) : displayed.length === 0 ? (
          <div className={styles.empty}>Nenhum usuário encontrado.</div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Status</th>
                  <th>Cadastro</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className={styles.userCell}>
                        <Avatar name={u.name} src={u.avatar_path} size={32} />
                        <div className={styles.userText}>
                          <Link href={`/profile/${u.username}`} className={styles.userName}>
                            {u.name || u.username}
                          </Link>
                          <span className={styles.userMeta}>@{u.username} · {u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td><StatusBadges user={u} /></td>
                    <td className={styles.muted}>{fmtDateShort(u.created_at)}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <Button size="sm" variant="ghost" onClick={() => act('set_admin', u.id, { value: !u.is_admin })}>
                          {u.is_admin ? 'Remover admin' : 'Tornar admin'}
                        </Button>
                        {u.status === 'suspended' || u.status === 'banned' ? (
                          <Button size="sm" variant="ghost" onClick={() => act('reinstate', u.id)}>
                            Reintegrar
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setSuspendTarget(u)}>
                              Suspender
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              danger
                              onClick={() => setConfirm({
                                title: 'Banir usuário',
                                message: `Banir @${u.username} permanentemente? Esta ação é irreversível.`,
                                fn: () => act('ban', u.id, { reason: 'Banimento manual' }),
                              })}
                            >
                              Banir
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager page={page} setPage={setPage} hasMore={hasMore} />
          </>
        )}
      </div>

      {suspendTarget ? (
        <SuspendModal
          user={suspendTarget}
          onClose={() => setSuspendTarget(null)}
          onConfirm={({ until, reason }) => act('suspend', suspendTarget.id, { until, reason })}
        />
      ) : null}

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title}
        message={confirm?.message}
        danger
        onConfirm={() => confirm?.fn()}
      />
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   GROUPS
   ════════════════════════════════════════════════════════════ */

function GroupsTab() {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const dq = useDebouncedValue(q, 200);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [reasonModal, setReasonModal] = useState(null); // { group, action }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (dq) p.set('q', dq);
      p.set('limit', String(PAGE_SIZE + 1));
      p.set('offset', String(page * PAGE_SIZE));
      const list = await api.get(`/api/admin/groups?${p}`);
      setItems(Array.isArray(list) ? list : []);
    } catch { toast('Falha ao carregar grupos.', { tone: 'danger' }); }
    finally { setLoading(false); }
  }, [dq, page, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [dq]);

  async function moderate(chat_id, action, reason) {
    try {
      await api.post('/api/admin/groups', { chat_id, action, reason: reason || null });
      toast('Ação aplicada.', { tone: 'success' });
      load();
    } catch { toast('Ação falhou.', { tone: 'danger' }); }
  }

  const displayed = items.slice(0, PAGE_SIZE);
  const hasMore = items.length > PAGE_SIZE;

  return (
    <>
      <div className={styles.section}>
        <div className={styles.sHead}>
          <div className={styles.search}>
            <SearchIcon size={16} className={styles.searchIcon} />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome ou descrição…"
              style={{ paddingLeft: 32 }}
            />
          </div>
          <Button size="sm" variant="ghost" onClick={load}><RefreshIcon size={14} /></Button>
        </div>

        {loading ? (
          <div className={styles.empty}>Carregando…</div>
        ) : displayed.length === 0 ? (
          <div className={styles.empty}>Nenhum grupo encontrado.</div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Criador</th>
                  <th>Membros</th>
                  <th>Status</th>
                  <th>Criado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((g) => {
                  let settings = {};
                  try { settings = g.group_settings ? JSON.parse(g.group_settings) : {}; } catch {}
                  const locked = !!settings.admin_locked;
                  return (
                    <tr key={g.id}>
                      <td>
                        <div className={styles.groupCell}>
                          <Avatar name={g.name} src={g.avatar_path} size={32} />
                          <div className={styles.groupText}>
                            <span className={styles.groupName}>{g.name || <em className={styles.muted}>Sem nome</em>}</span>
                            {g.description ? (
                              <span className={styles.groupDesc}>{g.description}</span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className={styles.muted}>
                        {g.creator_username ? `@${g.creator_username}` : '—'}
                      </td>
                      <td className={styles.muted}>{g.member_count ?? 0}</td>
                      <td>
                        {locked ? (
                          <span className={[styles.badge, styles.badgeLocked].join(' ')}>
                            Bloqueado
                          </span>
                        ) : (
                          <span className={[styles.badge, styles.badgeActive].join(' ')}>
                            Ativo
                          </span>
                        )}
                      </td>
                      <td className={styles.muted}>{fmtDateShort(g.created_at)}</td>
                      <td>
                        <div className={styles.rowActions}>
                          {locked ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => moderate(g.id, 'unlock', null)}
                            >
                              <UnlockIcon size={13} /> Desbloquear
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setReasonModal({ group: g, action: 'lock' })}
                            >
                              <LockIcon size={13} /> Bloquear
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            danger
                            onClick={() => setConfirm({
                              title: 'Excluir grupo',
                              message: `Excluir "${g.name || 'este grupo'}" permanentemente? Todas as mensagens serão perdidas.`,
                              fn: () => moderate(g.id, 'delete', null),
                            })}
                          >
                            <TrashIcon size={13} /> Excluir
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pager page={page} setPage={setPage} hasMore={hasMore} />
          </>
        )}
      </div>

      {/* Lock with reason modal */}
      {reasonModal ? (
        <LockGroupModal
          group={reasonModal.group}
          onClose={() => setReasonModal(null)}
          onConfirm={(reason) => { moderate(reasonModal.group.id, 'lock', reason); setReasonModal(null); }}
        />
      ) : null}

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title}
        message={confirm?.message}
        danger
        onConfirm={() => confirm?.fn()}
      />
    </>
  );
}

function LockGroupModal({ group, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title={`Bloquear grupo`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button danger onClick={() => onConfirm(reason.trim() || null)}>Bloquear grupo</Button>
        </>
      }
    >
      <p style={{ marginBottom: 10 }}>
        Bloquear <strong>{group.name}</strong>? Membros não poderão enviar mensagens.
      </p>
      <label className={styles.fieldLabel}>Motivo <span className={styles.optional}>(opcional)</span></label>
      <textarea
        className={styles.reasonInput}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo do bloqueio…"
        rows={3}
        maxLength={500}
      />
    </Modal>
  );
}

/* ════════════════════════════════════════════════════════════
   REPORTS
   ════════════════════════════════════════════════════════════ */

function ReportStatusBadge({ status }) {
  const map = {
    open: [styles.badgeOpen, 'Aberta'],
    reviewing: [styles.badgeReviewing, 'Em análise'],
    resolved: [styles.badgeResolved, 'Resolvida'],
    dismissed: [styles.badgeDismissed, 'Descartada'],
  };
  const [cls, label] = map[status] || [null, status];
  return <span className={[styles.badge, cls].join(' ')}>{label}</span>;
}

function TypeBadge({ type }) {
  const map = { user: 'Usuário', message: 'Mensagem', chat: 'Grupo' };
  return <span className={[styles.badge, styles.badgeType].join(' ')}>{map[type] || type}</span>;
}

function ReportsTab() {
  const { toast } = useToast();
  const [status, setStatus] = useState('open');
  const [targetType, setTargetType] = useState('');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (status) p.set('status', status);
      if (targetType) p.set('target_type', targetType);
      p.set('limit', String(PAGE_SIZE + 1));
      p.set('offset', String(page * PAGE_SIZE));
      const list = await api.get(`/api/admin/reports?${p}`);
      setItems(Array.isArray(list) ? list : []);
    } catch { toast('Falha ao carregar denúncias.', { tone: 'danger' }); }
    finally { setLoading(false); }
  }, [status, targetType, page, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [status, targetType]);

  async function resolve(id, decision) {
    try {
      await api.patch('/api/admin/reports', { id, decision });
      toast('Denúncia atualizada.', { tone: 'success' });
      setOpen(null);
      load();
    } catch { toast('Falha ao atualizar denúncia.', { tone: 'danger' }); }
  }

  const displayed = items.slice(0, PAGE_SIZE);
  const hasMore = items.length > PAGE_SIZE;

  return (
    <>
      <div className={styles.section}>
        <div className={styles.sHead}>
          <FilterSelect value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            <option value="open">Abertas</option>
            <option value="reviewing">Em análise</option>
            <option value="resolved">Resolvidas</option>
            <option value="dismissed">Descartadas</option>
          </FilterSelect>
          <FilterSelect value={targetType} onChange={(e) => setTargetType(e.target.value)}>
            <option value="">Todos os tipos</option>
            <option value="message">Mensagem</option>
            <option value="user">Usuário</option>
            <option value="chat">Grupo</option>
          </FilterSelect>
          <Button size="sm" variant="ghost" onClick={load}><RefreshIcon size={14} /></Button>
        </div>

        {loading ? (
          <div className={styles.empty}>Carregando…</div>
        ) : displayed.length === 0 ? (
          <div className={styles.empty}>Nenhuma denúncia encontrada.</div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Tipo</th>
                  <th>Motivo</th>
                  <th>Reportado por</th>
                  <th>Data</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((r) => (
                  <tr key={r.id}>
                    <td><ReportStatusBadge status={r.status} /></td>
                    <td><TypeBadge type={r.target_type} /></td>
                    <td className={styles.reasonCell}>{r.reason}</td>
                    <td className={styles.muted}>
                      {r.reporter_username ? `@${r.reporter_username}` : '—'}
                    </td>
                    <td className={styles.muted}>{fmtDate(r.created_at)}</td>
                    <td>
                      <Button size="sm" variant="ghost" onClick={() => setOpen(r)}>
                        Examinar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager page={page} setPage={setPage} hasMore={hasMore} />
          </>
        )}
      </div>
      {open ? (
        <ReportContextModal report={open} onClose={() => setOpen(null)} onResolve={resolve} />
      ) : null}
    </>
  );
}

function ReportContextModal({ report, onClose, onResolve }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    api.get(`/api/admin/reports?id=${encodeURIComponent(report.id)}`)
      .then((d) => { if (alive) setData(d); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [report.id]);

  const targetId = data?.report?.target_id;
  const messages = Array.isArray(data?.context) ? data.context : [];

  const footerActions = () => {
    if (report.status === 'open') return (
      <>
        <Button variant="ghost" onClick={onClose}>Fechar</Button>
        <Button variant="ghost" onClick={() => onResolve(report.id, 'reviewing')}>Em análise</Button>
        <Button variant="ghost" onClick={() => onResolve(report.id, 'dismissed')}>Descartar</Button>
        <Button danger onClick={() => onResolve(report.id, 'resolved')}>Marcar resolvida</Button>
      </>
    );
    if (report.status === 'reviewing') return (
      <>
        <Button variant="ghost" onClick={onClose}>Fechar</Button>
        <Button variant="ghost" onClick={() => onResolve(report.id, 'dismissed')}>Descartar</Button>
        <Button danger onClick={() => onResolve(report.id, 'resolved')}>Marcar resolvida</Button>
      </>
    );
    return <Button variant="ghost" onClick={onClose}>Fechar</Button>;
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Denúncia — ${report.target_type}`}
      width={780}
      footer={footerActions()}
    >
      <div className={styles.contextHead}>
        <div className={styles.contextMeta}>
          <div><strong>Status:</strong> <ReportStatusBadge status={report.status} /></div>
          <div><strong>Tipo de alvo:</strong> <TypeBadge type={report.target_type} /></div>
          <div><strong>Motivo:</strong> {report.reason}</div>
          {report.details ? <div><strong>Detalhes:</strong> {report.details}</div> : null}
          <div><strong>Reportado por:</strong> {report.reporter_username ? `@${report.reporter_username}` : '—'}</div>
          <div><strong>Em:</strong> {fmtDate(report.created_at)}</div>
        </div>
      </div>
      <div className={styles.warn} style={{ margin: '12px 0' }}>
        <AlertTriangleIcon size={14} style={{ marginRight: 6 }} />
        Exibindo até 15 mensagens anteriores e 5 posteriores ao alvo. O acesso completo ao chat não é permitido.
      </div>
      <div className={styles.contextBody}>
        {loading ? (
          <div className={styles.muted}>Carregando contexto…</div>
        ) : messages.length === 0 ? (
          <div className={styles.muted}>Sem contexto de mensagens disponível para esta denúncia.</div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={[styles.ctxMsg, m.id === targetId ? styles.ctxMsgTarget : ''].join(' ')}
            >
              <div className={styles.ctxMsgHead}>
                <span className={styles.ctxSender}>
                  {m.sender_username
                    ? `@${m.sender_username}`
                    : m.sender_name || (m.sender_id ? m.sender_id.slice(0, 8) : 'sistema')}
                  {m.id === targetId ? <span className={styles.ctxTargetTag}>alvo</span> : null}
                </span>
                <span>{fmtDate(m.created_at)}</span>
              </div>
              <div className={styles.ctxMsgBody}>
                {m.deleted
                  ? <em className={styles.muted}>(mensagem apagada)</em>
                  : m.body || (m.type ? <em className={styles.muted}>[{m.type}]</em> : '')}
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

/* ════════════════════════════════════════════════════════════
   AUDIT
   ════════════════════════════════════════════════════════════ */

function AuditTab() {
  const { toast } = useToast();
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [page, setPage] = useState(0);
  const da = useDebouncedValue(action, 250);
  const dactor = useDebouncedValue(actor, 250);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (da) p.set('action', da);
      if (dactor) p.set('actor', dactor);
      p.set('limit', String(PAGE_SIZE + 1));
      p.set('offset', String(page * PAGE_SIZE));
      const list = await api.get(`/api/admin/audit?${p}`);
      setItems(Array.isArray(list) ? list : []);
    } catch { toast('Falha ao carregar auditoria.', { tone: 'danger' }); }
    finally { setLoading(false); }
  }, [da, dactor, page, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [da, dactor]);

  const displayed = items.slice(0, PAGE_SIZE);
  const hasMore = items.length > PAGE_SIZE;

  return (
    <div className={styles.section}>
      <div className={styles.sHead}>
        <div className={styles.search}>
          <SearchIcon size={16} className={styles.searchIcon} />
          <Input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Filtrar por ação (ex: admin.report)…"
            style={{ paddingLeft: 32 }}
          />
        </div>
        <div className={styles.search} style={{ maxWidth: 220 }}>
          <Input
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="Filtrar por ator…"
          />
        </div>
        <Button size="sm" variant="ghost" onClick={load}><RefreshIcon size={14} /></Button>
      </div>

      {loading ? (
        <div className={styles.empty}>Carregando…</div>
      ) : displayed.length === 0 ? (
        <div className={styles.empty}>Nenhum registro encontrado.</div>
      ) : (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Ator</th>
                <th>Ação</th>
                <th>Alvo</th>
                <th>Metadados</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((a) => (
                <tr key={a.id}>
                  <td className={styles.muted}>{fmtDate(a.created_at)}</td>
                  <td>
                    {a.actor_username
                      ? <span title={a.actor_name}>@{a.actor_username}</span>
                      : <span className={styles.muted}>sistema</span>}
                  </td>
                  <td><code className={styles.actionCode}>{a.action}</code></td>
                  <td className={styles.muted}>
                    {a.target_type ? `${a.target_type}:${(a.target_id || '').slice(0, 8)}` : '—'}
                  </td>
                  <td>
                    {a.metadata
                      ? <pre className={styles.json}>{prettyJson(a.metadata)}</pre>
                      : <span className={styles.muted}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={page} setPage={setPage} hasMore={hasMore} />
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ERRORS
   ════════════════════════════════════════════════════════════ */

function LevelBadge({ level }) {
  const cls = level === 'error' ? styles.levelError
    : level === 'warn' ? styles.levelWarn
    : styles.levelInfo;
  return <span className={[styles.badge, cls].join(' ')}>{level}</span>;
}

function ErrorsTab() {
  const { toast } = useToast();
  const [level, setLevel] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const dq = useDebouncedValue(q, 250);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (level) p.set('level', level);
      if (dq) p.set('q', dq);
      p.set('limit', String(PAGE_SIZE + 1));
      p.set('offset', String(page * PAGE_SIZE));
      const list = await api.get(`/api/admin/errors?${p}`);
      setItems(Array.isArray(list) ? list : []);
    } catch { toast('Falha ao carregar erros.', { tone: 'danger' }); }
    finally { setLoading(false); }
  }, [level, dq, page, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [level, dq]);

  const displayed = items.slice(0, PAGE_SIZE);
  const hasMore = items.length > PAGE_SIZE;

  return (
    <div className={styles.section}>
      <div className={styles.sHead}>
        <div className={styles.search}>
          <SearchIcon size={16} className={styles.searchIcon} />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar na mensagem ou stack trace…"
            style={{ paddingLeft: 32 }}
          />
        </div>
        <FilterSelect value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">Todos os níveis</option>
          <option value="error">Erros</option>
          <option value="warn">Avisos</option>
          <option value="info">Info</option>
        </FilterSelect>
        <Button size="sm" variant="ghost" onClick={load}><RefreshIcon size={14} /></Button>
      </div>

      {loading ? (
        <div className={styles.empty}>Carregando…</div>
      ) : displayed.length === 0 ? (
        <div className={styles.empty}>Nenhum registro encontrado.</div>
      ) : (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Nível</th>
                <th>Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((e) => (
                <Fragment key={e.id}>
                  <tr
                    className={styles.errRow}
                    onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  >
                    <td className={styles.muted} style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.created_at)}</td>
                    <td><LevelBadge level={e.level} /></td>
                    <td>
                      <div className={styles.errMsg}>{e.message}</div>
                    </td>
                  </tr>
                  {expanded === e.id && (e.stack || e.metadata) ? (
                    <tr className={styles.errDetail}>
                      <td colSpan={3}>
                        {e.stack ? (
                          <pre className={styles.errStack}>{e.stack}</pre>
                        ) : null}
                        {e.metadata ? (
                          <pre className={styles.json} style={{ marginTop: e.stack ? 8 : 0 }}>
                            {prettyJson(e.metadata)}
                          </pre>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
          <Pager page={page} setPage={setPage} hasMore={hasMore} />
        </>
      )}
    </div>
  );
}
