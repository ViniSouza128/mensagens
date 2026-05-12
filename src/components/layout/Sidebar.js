'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/store/AppStateProvider';
import {
  ChatsIcon, ContactsIcon, ArchiveIcon, SearchIcon,
  CogIcon, ShieldIcon, LogoutIcon, ChevronRightIcon,
} from '@/components/icons/Icons';
import Avatar from '@/components/ui/Avatar';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { api } from '@/services/api';
import styles from './Sidebar.module.css';

function Item({ href, label, icon, active, badge, expanded, onClick }) {
  const cls = [styles.item, active ? styles.active : ''].join(' ');
  const content = (
    <>
      <span className={styles.icon}>{icon}</span>
      <span className={styles.text}>{label}</span>
      {badge ? <span className={styles.badge} aria-label={`${badge} novos`}>{badge > 99 ? '99+' : badge}</span> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} data-tip={!expanded ? label : undefined} data-tip-pos="right">
        {content}
      </button>
    );
  }
  return (
    <Link
      href={href}
      className={cls}
      aria-current={active ? 'page' : undefined}
      data-tip={!expanded ? label : undefined}
      data-tip-pos="right"
    >
      {content}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, requestsCount } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Persist preference
  useEffect(() => {
    try { setExpanded(localStorage.getItem('mensagens.sidebar.expanded') === '1'); } catch {}
  }, []);
  function toggleExpand() {
    setExpanded((e) => {
      const next = !e;
      try { localStorage.setItem('mensagens.sidebar.expanded', next ? '1' : '0'); } catch {}
      return next;
    });
  }

  const isActive = (p) => pathname === p || pathname.startsWith(p + '/');

  async function logout() {
    await api.post('/api/auth/logout', {}).catch(() => {});
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
    <nav
      className={[styles.nav, expanded ? styles.expanded : ''].join(' ')}
      aria-label="Navegação principal"
      data-expanded={expanded ? 'true' : 'false'}
    >
      <Link href="/profile" className={styles.brand} data-tip={!expanded ? 'Perfil' : undefined} data-tip-pos="right">
        <Avatar name={user?.name} src={user?.avatar_path} size={42} />
        <span className={styles.text}>{user?.name || 'Perfil'}</span>
      </Link>
      <div className={styles.group}>
        <Item href="/chats" label="Conversas" icon={<ChatsIcon />} active={isActive('/chats')} expanded={expanded} />
        <Item href="/contacts" label="Contatos" icon={<ContactsIcon />} active={isActive('/contacts')} badge={requestsCount} expanded={expanded} />
        <Item href="/search" label="Buscar" icon={<SearchIcon />} active={isActive('/search')} expanded={expanded} />
        <Item href="/archived" label="Arquivados" icon={<ArchiveIcon />} active={isActive('/archived')} expanded={expanded} />
      </div>
      <div className={styles.spacer} />
      <div className={styles.group}>
        {user?.is_admin ? (
          <Item href="/admin" label="Admin" icon={<ShieldIcon />} active={isActive('/admin')} expanded={expanded} />
        ) : null}
        <Item href="/settings" label="Configurações" icon={<CogIcon />} active={isActive('/settings')} expanded={expanded} />
        <Item label="Sair" icon={<LogoutIcon />} onClick={() => setShowLogoutConfirm(true)} expanded={expanded} />
        <button
          type="button"
          className={[styles.item, styles.collapseBtn].join(' ')}
          onClick={toggleExpand}
          data-tip={!expanded ? 'Expandir' : 'Recolher'}
          data-tip-pos="right"
          aria-label={expanded ? 'Recolher menu' : 'Expandir menu'}
        >
          <span className={styles.icon}>
            <ChevronRightIcon style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform var(--t-mid)' }} />
          </span>
          <span className={styles.text}>{expanded ? 'Recolher' : 'Expandir'}</span>
        </button>
      </div>
    </nav>

    <ConfirmModal
      open={showLogoutConfirm}
      title="Sair da conta?"
      message="Você será desconectado e precisará entrar novamente."
      confirmLabel="Sair"
      cancelLabel="Cancelar"
      danger
      onConfirm={logout}
      onCancel={() => setShowLogoutConfirm(false)}
    />
    </>
  );
}
