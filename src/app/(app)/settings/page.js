'use client';
import { useEffect, useId, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { useApp } from '@/store/AppStateProvider';
import { useToast } from '@/components/ui/Toast';
import { useTheme } from '@/components/layout/ThemeProvider';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import {
  LogoutIcon, ShieldIcon, BellIcon, CogIcon, EditIcon, CheckIcon,
  XIcon, UserIcon, LockIcon, AlertIcon, SunIcon, MoonIcon,
} from '@/components/icons/Icons';
import useDragScroll from '@/hooks/useDragScroll';
import styles from './settings.module.css';

/* ── constants ────────────────────────────────────────────── */

const PRIVACY_OPTS = [
  { value: 'everyone', label: 'Todos' },
  { value: 'contacts', label: 'Apenas contatos' },
  { value: 'nobody', label: 'Ninguém' },
];

const ACCENTS = [
  { name: 'Índigo', value: 'indigo', color: '#6366f1' },
  { name: 'Violeta', value: 'violet', color: '#8b5cf6' },
  { name: 'Azul', value: 'sky', color: '#0ea5e9' },
  { name: 'Verde', value: 'emerald', color: '#10b981' },
  { name: 'Teal', value: 'teal', color: '#14b8a6' },
  { name: 'Rosa', value: 'rose', color: '#f43f5e' },
  { name: 'Âmbar', value: 'amber', color: '#f59e0b' },
];

const TABS = [
  { value: 'account',       label: 'Conta',          Icon: UserIcon },
  { value: 'privacy',       label: 'Privacidade',     Icon: ShieldIcon },
  { value: 'notifications', label: 'Notificações',    Icon: BellIcon },
  { value: 'appearance',    label: 'Aparência',       Icon: SunIcon },
  { value: 'media',         label: 'Mídia & Conversa', Icon: CogIcon },
  { value: 'feedback',      label: 'Feedback',        Icon: EditIcon },
];

/* ── helpers ──────────────────────────────────────────────── */

function useDebounce(value, delay) {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

/* ── shared components ────────────────────────────────────── */

/**
 * Section wrapper — <section> + visually labelled heading.
 */
function Section({ id, title, desc, children }) {
  const headId = `${id}-title`;
  return (
    <section className={styles.section} aria-labelledby={headId}>
      <div className={styles.sHead}>
        <h2 className={styles.h2} id={headId}>{title}</h2>
        {desc ? <p className={styles.sDesc}>{desc}</p> : null}
      </div>
      <div className={styles.sBody}>{children}</div>
    </section>
  );
}

/**
 * Row — associates label text with the right-side control via aria-labelledby.
 * Pass `htmlFor` when the control is a native input/select for a proper <label> link.
 */
function Row({ htmlFor, label, hint, id: rowId, children }) {
  const uid = useId();
  const labelId = rowId || uid;
  return (
    <div className={styles.row}>
      <div className={styles.rowLabel} id={`${labelId}-lbl`}>
        {htmlFor ? (
          <label htmlFor={htmlFor} className={styles.rowLabelText}>{label}</label>
        ) : (
          <span className={styles.rowLabelText}>{label}</span>
        )}
        {hint ? <span className={styles.rowHint}>{hint}</span> : null}
      </div>
      <div className={styles.rowControl} aria-labelledby={htmlFor ? undefined : `${labelId}-lbl`}>
        {children}
      </div>
    </div>
  );
}

/**
 * PrivacySelect — styled <select> with label properly associated.
 */
function PrivacySelect({ id, value, onChange, 'aria-label': ariaLabel }) {
  return (
    <select
      id={id}
      className={styles.select}
      value={value}
      onChange={onChange}
      aria-label={ariaLabel}
    >
      {PRIVACY_OPTS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════ */

export default function SettingsPage() {
  const router = useRouter();
  const { user, refreshMe } = useApp();
  const { toast } = useToast();
  const themeCtx = useTheme();
  const [tab, setTab] = useState('account');
  const tabsRef = useDragScroll();

  if (!user) return <div className={styles.loading} aria-live="polite">Carregando…</div>;

  async function logout() {
    await api.post('/api/auth/logout', {}).catch(() => {});
    router.replace('/login');
    router.refresh();
  }

  async function patch(payload) {
    try {
      await api.patch('/api/users/me', payload);
      await refreshMe();
    } catch {
      toast('Não foi possível salvar.', { tone: 'danger' });
    }
  }

  return (
    <div className={styles.wrap}>
      {/* Skip link for keyboard users */}
      <a href="#settings-content" className={styles.skipLink}>
        Ir para o conteúdo
      </a>

      <header className={styles.header}>
        <h1 className={styles.pageTitle}>Configurações</h1>
      </header>

      {/* Tab navigation */}
      <nav className={styles.tabs} aria-label="Categorias de configuração">
        <div className={styles.tabList} role="tablist" ref={tabsRef}>
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={tab === t.value}
              aria-controls={`panel-${t.value}`}
              id={`tab-${t.value}`}
              className={[styles.tab, tab === t.value ? styles.tabActive : ''].join(' ')}
              onClick={() => setTab(t.value)}
            >
              <t.Icon size={15} aria-hidden="true" />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <main id="settings-content" className={styles.body}>
        {TABS.map((t) => (
          <div
            key={t.value}
            id={`panel-${t.value}`}
            role="tabpanel"
            aria-labelledby={`tab-${t.value}`}
            hidden={tab !== t.value}
            className={styles.panel}
          >
            {tab === t.value && (
              <>
                {t.value === 'account'       && <AccountSection       user={user} onPatch={patch} />}
                {t.value === 'privacy'       && <PrivacySection       user={user} onPatch={patch} />}
                {t.value === 'notifications' && <NotificationsSection user={user} onPatch={patch} />}
                {t.value === 'appearance'    && <AppearanceSection    user={user} onPatch={patch} themeCtx={themeCtx} />}
                {t.value === 'media'         && <MediaSection         user={user} onPatch={patch} />}
                {t.value === 'feedback'      && <FeedbackSection />}
              </>
            )}
          </div>
        ))}
      </main>

      <div className={styles.footer}>
        <Button variant="ghost" danger onClick={logout}>
          <LogoutIcon size={16} aria-hidden="true" /> Sair desta conta
        </Button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ACCOUNT
   ═══════════════════════════════════════════════════════════ */

function AvatarUpload({ user, onUploaded }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kindHint', 'image');
      const arr = await api.upload('/api/uploads', fd);
      const meta = Array.isArray(arr) ? arr[0] : arr;
      await api.patch('/api/users/me', { avatar_path: meta.storage_path });
      onUploaded();
      toast('Foto atualizada.', { tone: 'success' });
    } catch {
      toast('Falha ao enviar foto.', { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.avatarWrap}>
      <button
        type="button"
        className={styles.avatarBtn}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={busy ? 'Enviando foto…' : 'Trocar foto de perfil'}
        title="Trocar foto de perfil"
      >
        <Avatar name={user.name} src={user.avatar_path} size={88} />
        <span className={styles.avatarOverlay} aria-hidden="true">
          <EditIcon size={18} />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => handleFile(e.target.files?.[0])}
        disabled={busy}
      />
      <div className={styles.avatarInfo}>
        <p className={styles.avatarName}>{user.name}</p>
        <p className={styles.avatarHint}>JPG, PNG ou GIF · até 5 MB</p>
      </div>
    </div>
  );
}

function UsernameField({ currentUsername, onSave }) {
  const [value, setValue] = useState(currentUsername || '');
  const [status, setStatus] = useState('idle'); // idle | checking | available | taken | invalid
  const debouncedValue = useDebounce(value, 500);
  const { toast } = useToast();

  const changed = value !== currentUsername;
  const FORMAT_RE = /^[a-zA-Z0-9_.]{3,30}$/;

  useEffect(() => {
    if (!changed || !debouncedValue) { setStatus('idle'); return; }
    if (!FORMAT_RE.test(debouncedValue)) { setStatus('invalid'); return; }
    if (debouncedValue === currentUsername) { setStatus('idle'); return; }

    setStatus('checking');
    // Verifica disponibilidade via busca — se não encontrar exato, está disponível
    api.get(`/api/users?q=${encodeURIComponent(debouncedValue)}&limit=5`)
      .then((results) => {
        const taken = Array.isArray(results) &&
          results.some((u) => u.username?.toLowerCase() === debouncedValue.toLowerCase());
        setStatus(taken ? 'taken' : 'available');
      })
      .catch(() => setStatus('idle'));
  }, [debouncedValue, currentUsername, changed]);

  async function save() {
    if (!changed || status === 'taken' || status === 'invalid' || status === 'checking') return;
    try {
      await onSave({ username: value.trim() });
      toast('Nome de usuário atualizado.', { tone: 'success' });
    } catch (err) {
      if (err?.message?.includes('username_taken') || err?.status === 409) {
        setStatus('taken');
        toast('Este nome de usuário já está em uso.', { tone: 'danger' });
      } else if (err?.message?.includes('invalid_username')) {
        setStatus('invalid');
        toast('Formato inválido. Use letras, números, _ ou .', { tone: 'danger' });
      } else {
        toast('Não foi possível salvar.', { tone: 'danger' });
      }
    }
  }

  const statusMsg = {
    checking:  { text: 'Verificando…', cls: styles.statusChecking },
    available: { text: '✓ Disponível', cls: styles.statusOk },
    taken:     { text: '✗ Já está em uso', cls: styles.statusError },
    invalid:   { text: '3–30 caracteres: letras, números, _ ou .', cls: styles.statusError },
  }[status];

  return (
    <div className={styles.usernameField}>
      <label className={styles.fieldLabel} htmlFor="settings-username">
        Nome de usuário
      </label>
      <div className={styles.usernameInputRow}>
        <span className={styles.usernameAt} aria-hidden="true">@</span>
        <Input
          id="settings-username"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\s/g, ''))}
          maxLength={30}
          autoComplete="username"
          aria-describedby={statusMsg ? 'username-status' : undefined}
        />
        {changed && (status === 'available' || status === 'idle') && (
          <Button
            size="sm"
            onClick={save}
            disabled={status === 'checking' || !FORMAT_RE.test(value)}
            aria-label="Salvar nome de usuário"
          >
            Salvar
          </Button>
        )}
      </div>
      {statusMsg && (
        <span id="username-status" className={[styles.statusMsg, statusMsg.cls].join(' ')} role="status" aria-live="polite">
          {statusMsg.text}
        </span>
      )}
      <span className={styles.fieldHint}>
        Visível para todos. Use letras, números, <code>_</code> ou <code>.</code>
      </span>
    </div>
  );
}

function AccountSection({ user, onPatch }) {
  const { refreshMe } = useApp();
  const [name, setName] = useState(user.name || '');
  const [bio, setBio] = useState(user.bio || '');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const dirty = name !== (user.name || '') || bio !== (user.bio || '');

  async function save() {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      await onPatch({ name: name.trim(), bio });
      toast('Perfil atualizado.', { tone: 'success' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section id="account" title="Conta" desc="Suas informações públicas no app.">
      <AvatarUpload user={user} onUploaded={refreshMe} />

      <div className={styles.fields}>
        <UsernameField currentUsername={user.username} onSave={onPatch} />

        <Field label="Nome de exibição">
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoComplete="name"
              aria-describedby={`${id}-count`}
            />
          )}
        </Field>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="settings-bio">
            Bio <span className={styles.optional}>(opcional)</span>
          </label>
          <textarea
            id="settings-bio"
            className={styles.textarea}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={280}
            placeholder="Conte algo sobre você…"
            aria-describedby="bio-count"
          />
          <span id="bio-count" className={styles.charCount} aria-live="polite">
            {bio.length}/280
          </span>
        </div>
      </div>

      <div className={styles.sActions}>
        <Button
          onClick={save}
          loading={busy}
          disabled={!dirty}
          aria-label={dirty ? 'Salvar alterações do perfil' : 'Sem alterações pendentes'}
        >
          {dirty ? 'Salvar alterações' : 'Sem alterações'}
        </Button>
      </div>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   PRIVACY
   ═══════════════════════════════════════════════════════════ */

function BlockedContacts() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/contacts/block')
      .then((list) => setItems(Array.isArray(list) ? list : []))
      .catch(() => toast('Não foi possível carregar bloqueados.', { tone: 'danger' }))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function unblock(userId, username) {
    try {
      await api.delete('/api/contacts/block', { user_id: userId });
      toast(`@${username} desbloqueado.`, { tone: 'success' });
      load();
    } catch {
      toast('Não foi possível desbloquear.', { tone: 'danger' });
    }
  }

  if (loading) return <div className={styles.blockedLoading} aria-live="polite">Carregando…</div>;

  if (items.length === 0) return (
    <div className={styles.blockedEmpty}>
      <LockIcon size={24} aria-hidden="true" />
      <span>Nenhuma conta bloqueada.</span>
    </div>
  );

  return (
    <ul className={styles.blockedList} aria-label="Contas bloqueadas">
      {items.map((u) => (
        <li key={u.id} className={styles.blockedItem}>
          <Avatar name={u.name} src={u.avatar_path} size={36} />
          <div className={styles.blockedInfo}>
            <span className={styles.blockedName}>{u.name || u.username}</span>
            <span className={styles.blockedHandle}>@{u.username}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => unblock(u.id, u.username)}
            aria-label={`Desbloquear @${u.username}`}
          >
            Desbloquear
          </Button>
        </li>
      ))}
    </ul>
  );
}

function PrivacySection({ user, onPatch }) {
  return (
    <>
      <Section id="privacy-visibility" title="Visibilidade" desc="Escolha quem pode ver suas informações.">
        <Row htmlFor="priv-last-seen" label="Visto por último e online" hint="Controla quando outros veem sua hora de atividade.">
          <PrivacySelect
            id="priv-last-seen"
            value={user.privacy_last_seen || 'everyone'}
            onChange={(e) => onPatch({ privacy_last_seen: e.target.value })}
          />
        </Row>
        <Row htmlFor="priv-avatar" label="Foto de perfil">
          <PrivacySelect
            id="priv-avatar"
            value={user.privacy_avatar || 'everyone'}
            onChange={(e) => onPatch({ privacy_avatar: e.target.value })}
          />
        </Row>
        <Row htmlFor="priv-bio" label="Bio">
          <PrivacySelect
            id="priv-bio"
            value={user.privacy_bio || 'everyone'}
            onChange={(e) => onPatch({ privacy_bio: e.target.value })}
          />
        </Row>
      </Section>

      <Section id="privacy-messages" title="Mensagens" desc="Controle quem pode iniciar uma conversa com você.">
        <Row label="Confirmações de leitura" hint="Mostra dois tiques azuis quando você lê uma mensagem.">
          <ToggleSwitch
            checked={!!user.read_receipts}
            onChange={(v) => onPatch({ read_receipts: v })}
            aria-label="Confirmações de leitura"
          />
        </Row>
        <Row label="Bloquear mensagens de desconhecidos" hint="Contas que não estão nos seus contatos precisarão pedir para adicioná-lo.">
          <ToggleSwitch
            checked={!!user.block_unknown}
            onChange={(v) => onPatch({ block_unknown: v })}
            aria-label="Bloquear mensagens de desconhecidos"
          />
        </Row>
      </Section>

      <Section id="privacy-blocked" title="Contas bloqueadas" desc="Usuários bloqueados não podem enviar mensagens nem ver seu perfil.">
        <BlockedContacts />
      </Section>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   NOTIFICATIONS
   ═══════════════════════════════════════════════════════════ */

function NotificationsSection({ user, onPatch }) {
  return (
    <Section id="notifications" title="Notificações" desc="Controle alertas e sons.">
      <Row label="Mensagens" hint="Receba notificações de novas mensagens.">
        <ToggleSwitch
          checked={!!user.notify_messages}
          onChange={(v) => onPatch({ notify_messages: v })}
          aria-label="Notificações de mensagens"
        />
      </Row>
      <Row label="Grupos" hint="Receba notificações de atividades em grupos.">
        <ToggleSwitch
          checked={!!user.notify_groups}
          onChange={(v) => onPatch({ notify_groups: v })}
          aria-label="Notificações de grupos"
        />
      </Row>
      <Row label="Sons" hint="Reproduza um som ao enviar e ao receber mensagens.">
        <ToggleSwitch
          checked={!!user.sound_enabled}
          onChange={(v) => onPatch({ sound_enabled: v })}
          aria-label="Sons ao enviar e receber mensagens"
        />
      </Row>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   APPEARANCE
   ═══════════════════════════════════════════════════════════ */

function ThemePicker({ value, onChange }) {
  const themes = [
    { value: 'light', label: 'Claro', Icon: SunIcon },
    { value: 'dark',  label: 'Escuro', Icon: MoonIcon },
    { value: 'auto',  label: 'Sistema', Icon: CogIcon },
  ];
  return (
    <div className={styles.themeCards} role="group" aria-label="Tema">
      {themes.map((t) => (
        <button
          key={t.value}
          type="button"
          role="radio"
          aria-checked={value === t.value}
          className={[styles.themeCard, value === t.value ? styles.themeCardActive : ''].join(' ')}
          onClick={() => onChange(t.value)}
        >
          <div className={[styles.themePreview, styles[`themePreview_${t.value}`]].join(' ')} aria-hidden="true">
            <div className={styles.themePreviewBar} />
            <div className={styles.themePreviewBubbles}>
              <div className={styles.themePreviewBubbleIn} />
              <div className={styles.themePreviewBubbleOut} />
            </div>
          </div>
          <div className={styles.themeCardLabel}>
            <t.Icon size={13} aria-hidden="true" />
            {t.label}
          </div>
        </button>
      ))}
    </div>
  );
}

function FontSizePicker({ value, onChange }) {
  const sizes = [
    { value: 'small',  label: 'Pequena', sample: '13px' },
    { value: 'normal', label: 'Normal',  sample: '15px' },
    { value: 'large',  label: 'Grande',  sample: '18px' },
  ];
  return (
    <div className={styles.fontCards} role="group" aria-label="Tamanho da fonte">
      {sizes.map((s) => (
        <button
          key={s.value}
          type="button"
          role="radio"
          aria-checked={value === s.value}
          className={[styles.fontCard, value === s.value ? styles.fontCardActive : ''].join(' ')}
          onClick={() => onChange(s.value)}
        >
          <span className={styles.fontSample} style={{ fontSize: s.sample }} aria-hidden="true">Aa</span>
          <span className={styles.fontLabel}>{s.label}</span>
        </button>
      ))}
    </div>
  );
}

function AccentPicker({ value, onChange }) {
  return (
    <div className={styles.swatches} role="group" aria-label="Cor de destaque">
      {ACCENTS.map((a) => (
        <button
          key={a.value}
          type="button"
          role="radio"
          aria-checked={value === a.value}
          aria-label={a.name}
          title={a.name}
          className={[styles.swatch, value === a.value ? styles.swatchActive : ''].join(' ')}
          style={{ '--swatch-color': a.color }}
          onClick={() => onChange(a.value)}
        >
          {value === a.value && <CheckIcon size={13} className={styles.swatchCheck} aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

// Built-in wallpaper presets — gradients/patterns served as data URIs to avoid extra requests
const WALLPAPER_PRESETS = [
  { id: null, label: 'Nenhum', preview: 'transparent' },
  { id: 'preset:soft-dawn', label: 'Aurora', preview: 'linear-gradient(135deg, #fef3c7, #fbcfe8)' },
  { id: 'preset:ocean', label: 'Oceano', preview: 'linear-gradient(135deg, #bae6fd, #c7d2fe)' },
  { id: 'preset:mint', label: 'Menta', preview: 'linear-gradient(135deg, #d1fae5, #a7f3d0)' },
  { id: 'preset:lavender', label: 'Lavanda', preview: 'linear-gradient(135deg, #ede9fe, #fbcfe8)' },
  { id: 'preset:graphite', label: 'Grafite', preview: 'linear-gradient(135deg, #1f2937, #0f172a)' },
  { id: 'preset:dots', label: 'Pontos', preview: 'radial-gradient(circle at 25% 25%, var(--text-faint) 1px, transparent 1px) 0 0/20px 20px, var(--surface)' },
];

function WallpaperPresets({ value, onChange }) {
  return (
    <div className={styles.wallpaperPresets} role="radiogroup" aria-label="Papéis de parede prontos">
      {WALLPAPER_PRESETS.map((p) => (
        <button
          key={p.id || 'none'}
          type="button"
          role="radio"
          aria-checked={value === p.id}
          aria-label={p.label}
          title={p.label}
          className={[styles.wallpaperPresetBtn, value === p.id ? styles.wallpaperPresetActive : ''].join(' ')}
          style={{ background: p.preview }}
          onClick={() => onChange(p.id)}
        />
      ))}
    </div>
  );
}

function WallpaperPicker({ user, onPatch }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const inputRef = useRef(null);

  async function upload(file) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kindHint', 'image');
      const arr = await api.upload('/api/uploads', fd);
      const meta = Array.isArray(arr) ? arr[0] : arr;
      await onPatch({ wallpaper: meta.storage_path });
      toast('Papel de parede atualizado.', { tone: 'success' });
    } catch {
      toast('Falha ao enviar imagem.', { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  const isPreset = typeof user.wallpaper === 'string' && user.wallpaper.startsWith('preset:');

  return (
    <>
      <Row label="Pré-definidos" hint="Escolha rapidamente um fundo bonito.">
        <WallpaperPresets
          value={isPreset || !user.wallpaper ? user.wallpaper || null : null}
          onChange={(id) => onPatch({ wallpaper: id })}
        />
      </Row>
      <Row label="Imagem personalizada" hint="Envie sua própria imagem (JPG, PNG ou WebP).">
      <div className={styles.wallpaperRow}>
        {user.wallpaper && !isPreset ? (
          <button
            type="button"
            className={styles.wallpaperPreviewBtn}
            onClick={() => inputRef.current?.click()}
            aria-label="Trocar papel de parede"
            title="Trocar papel de parede"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/files/${user.wallpaper}`}
              alt="Papel de parede atual"
              className={styles.wallpaperImg}
            />
          </button>
        ) : (
          <button
            type="button"
            className={styles.wallpaperEmpty}
            onClick={() => inputRef.current?.click()}
            aria-label="Escolher papel de parede"
          >
            <span aria-hidden="true">+</span>
          </button>
        )}
        <div className={styles.wallpaperActions}>
          <button
            type="button"
            className={styles.uploadBtn}
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? 'Enviando…' : user.wallpaper ? 'Trocar' : 'Escolher'}
          </button>
          {user.wallpaper && !isPreset && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onPatch({ wallpaper: null })}
              aria-label="Remover papel de parede"
            >
              Remover
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className={styles.hiddenInput}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => upload(e.target.files?.[0])}
          disabled={busy}
        />
      </div>
    </Row>
    </>
  );
}

// Live preview do tema/cor/fonte/densidade — minichat de demonstração
function AppearancePreview({ accent, font, density }) {
  return (
    <div
      className={styles.appearancePreview}
      data-accent={accent}
      data-font={font}
      data-density={density}
    >
      <div className={styles.preview2Bar}>Pré-visualização</div>
      <div className={styles.preview2Body}>
        <div className={styles.preview2Bubble}>Olá! 👋</div>
        <div className={[styles.preview2Bubble, styles.preview2BubbleMine].join(' ')}>
          Tudo certo por aqui — <strong>preview ao vivo</strong>.
        </div>
        <div className={styles.preview2Bubble}>Suas escolhas atualizam aqui em tempo real.</div>
      </div>
    </div>
  );
}

function DensityPicker({ value, onChange }) {
  const opts = [
    { value: 'compact', label: 'Compacta' },
    { value: 'comfortable', label: 'Confortável' },
    { value: 'spacious', label: 'Espaçada' },
  ];
  return (
    <div className={styles.fontCards} role="radiogroup" aria-label="Densidade">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={[styles.fontCard, value === o.value ? styles.fontCardActive : ''].join(' ')}
          onClick={() => onChange(o.value)}
        >
          <span className={styles.fontLabel}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function AppearanceSection({ user, onPatch, themeCtx }) {
  function setTheme(t) { themeCtx.setTheme?.(t); onPatch({ theme: t }); }
  function setAccent(a) { themeCtx.setAccent?.(a); onPatch({ accent: a }); }
  function setFont(f) { themeCtx.setFont?.(f); onPatch({ font_size: f }); }
  function setDensity(d) { themeCtx.setDensity?.(d); onPatch({ density: d }); }

  return (
    <>
      <Section id="appearance-preview" title="Prévia" desc="Suas escolhas refletem aqui em tempo real.">
        <AppearancePreview
          accent={user.accent || 'indigo'}
          font={user.font_size || 'normal'}
          density={user.density || 'comfortable'}
        />
      </Section>

      <Section id="appearance-theme" title="Tema" desc="Claro, escuro ou seguindo as preferências do sistema.">
        <ThemePicker value={user.theme || 'auto'} onChange={setTheme} />
      </Section>

      <Section id="appearance-accent" title="Cor de destaque" desc="Cor principal usada em botões, badges e destaques.">
        <AccentPicker value={user.accent || 'indigo'} onChange={setAccent} />
      </Section>

      <Section id="appearance-font" title="Tamanho da fonte" desc="Ajuste o tamanho do texto nas conversas.">
        <FontSizePicker value={user.font_size || 'normal'} onChange={setFont} />
      </Section>

      <Section id="appearance-density" title="Densidade" desc="Mais compacto economiza espaço; mais espaçado fica mais legível.">
        <DensityPicker value={user.density || 'comfortable'} onChange={setDensity} />
      </Section>

      <Section id="appearance-wallpaper" title="Papel de parede" desc="Personalize o fundo das suas conversas.">
        <WallpaperPicker user={user} onPatch={onPatch} />
      </Section>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   MEDIA & CHAT
   ═══════════════════════════════════════════════════════════ */

function MediaSection({ user, onPatch }) {
  return (
    <>
      <Section id="media" title="Mídia" desc="Qualidade e download automático de fotos e vídeos.">
        <Row htmlFor="media-quality" label="Qualidade de fotos" hint="HD usa mais armazenamento e dados móveis.">
          <select
            id="media-quality"
            className={styles.select}
            value={user.media_quality || 'optimized'}
            onChange={(e) => onPatch({ media_quality: e.target.value })}
          >
            <option value="optimized">Otimizado (recomendado)</option>
            <option value="hd">HD (original)</option>
          </select>
        </Row>
        <Row htmlFor="media-download" label="Download automático" hint="Quando baixar mídia sem precisar tocar.">
          <select
            id="media-download"
            className={styles.select}
            value={user.auto_download || 'wifi'}
            onChange={(e) => onPatch({ auto_download: e.target.value })}
          >
            <option value="always">Sempre</option>
            <option value="wifi">Apenas em Wi-Fi</option>
            <option value="never">Nunca (manual)</option>
          </select>
        </Row>
      </Section>

      <Section id="chat-settings" title="Conversa" desc="Comportamento do campo de digitação.">
        <Row label="Enviar com Enter" hint="Shift+Enter insere uma quebra de linha.">
          <ToggleSwitch
            checked={!!user.send_with_enter}
            onChange={(v) => onPatch({ send_with_enter: v })}
            aria-label="Enviar mensagem com Enter"
          />
        </Row>
      </Section>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   FEEDBACK
   ═══════════════════════════════════════════════════════════ */

function FeedbackSection() {
  const { toast } = useToast();
  const [topic, setTopic] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      await api.post('/api/feedback', { topic: topic || null, body: body.trim() });
      setSent(true);
      setBody('');
      setTopic('');
    } catch {
      toast('Não foi possível enviar o feedback. Tente novamente.', { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Section id="feedback" title="Feedback" desc="Sua opinião é muito importante.">
        <div className={styles.feedbackSuccess} role="status" aria-live="polite">
          <CheckIcon size={28} aria-hidden="true" />
          <p className={styles.feedbackSuccessTitle}>Mensagem enviada!</p>
          <p className={styles.feedbackSuccessHint}>
            Agradecemos seu feedback. Lemos tudo com atenção.
          </p>
          <Button variant="ghost" onClick={() => setSent(false)}>
            Enviar outro feedback
          </Button>
        </div>
      </Section>
    );
  }

  return (
    <Section id="feedback" title="Fale Conosco" desc="Sugestões, problemas ou qualquer mensagem que quiser compartilhar.">
      <form onSubmit={submit} className={styles.feedbackForm} noValidate>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="feedback-topic">
            Assunto <span className={styles.optional}>(opcional)</span>
          </label>
          <select
            id="feedback-topic"
            className={styles.select}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            <option value="">Selecione um assunto…</option>
            <option value="bug">Reportar um problema</option>
            <option value="suggestion">Sugestão de melhoria</option>
            <option value="question">Dúvida</option>
            <option value="other">Outro</option>
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="feedback-body">
            Mensagem <span className={styles.required} aria-hidden="true">*</span>
          </label>
          <textarea
            id="feedback-body"
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={4000}
            placeholder="Descreva sua sugestão, problema ou mensagem…"
            required
            aria-required="true"
            aria-describedby="feedback-count"
          />
          <span id="feedback-count" className={styles.charCount} aria-live="polite">
            {body.length}/4000
          </span>
        </div>

        <div className={styles.sActions}>
          <Button
            type="submit"
            loading={busy}
            disabled={!body.trim()}
            aria-label="Enviar feedback"
          >
            Enviar feedback
          </Button>
        </div>
      </form>
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
   TOGGLE SWITCH (acessível)
   ═══════════════════════════════════════════════════════════ */

function ToggleSwitch({ checked, onChange, 'aria-label': ariaLabel, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={[styles.toggle, checked ? styles.toggleOn : ''].join(' ')}
      onClick={() => !disabled && onChange?.(!checked)}
    >
      <span className={styles.toggleKnob} />
      <span className="sr-only">{checked ? 'Ativado' : 'Desativado'}</span>
    </button>
  );
}
