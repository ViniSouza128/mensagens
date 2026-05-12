'use client';
import { useRouter } from 'next/navigation';
import Avatar from '@/components/ui/Avatar';
import IconButton from '@/components/ui/IconButton';
import {
  ArrowLeftIcon, ForwardIcon, XIcon, InfoIcon, SearchIcon,
} from '@/components/icons/Icons';
import styles from './ChatHeader.module.css';

export default function ChatHeader({
  chat, onOpenInfo, selectionMode, selectedCount, onClearSelection, onForwardSelection,
  searchOpen, onToggleSearch, infoOpen,
}) {
  const router = useRouter();
  const sub = subtitle(chat);
  const isOnline = chat?.type === 'direct' ? !!(chat?.partner?.online) : false;

  if (selectionMode) {
    return (
      <header className={styles.header} role="banner">
        <IconButton label="Cancelar seleção" onClick={onClearSelection}><XIcon /></IconButton>
        <div className={styles.selectionBar}>
          <span className={styles.selectionCount}>{selectedCount} selecionada{selectedCount === 1 ? '' : 's'}</span>
        </div>
        <div className={styles.actions}>
          <IconButton label="Encaminhar" onClick={onForwardSelection} disabled={selectedCount === 0}><ForwardIcon /></IconButton>
        </div>
      </header>
    );
  }

  const avatarSrc = chat?.avatar_path || null;

  return (
    <header className={styles.header} role="banner">
      <button type="button" className={styles.back} onClick={() => router.push('/chats')} aria-label="Voltar">
        <ArrowLeftIcon />
      </button>
      <button type="button" className={styles.identity} onClick={onOpenInfo} aria-label="Ver informações">
        <Avatar name={chat?.name} src={avatarSrc} size={42} online={isOnline} />
        <div className={styles.titleArea}>
          <div className={styles.title}>{chat?.name || 'Conversa'}</div>
          {sub ? (
            <div className={[styles.subtitle, isOnline ? styles.subtitleOnline : ''].join(' ')}>
              {sub}
            </div>
          ) : null}
        </div>
      </button>
      <div className={styles.actions}>
        <IconButton
          label={searchOpen ? 'Fechar busca' : 'Buscar na conversa'}
          tipPos="bottom"
          onClick={onToggleSearch}
          aria-pressed={searchOpen}
          className={searchOpen ? styles.searchActive : undefined}
        >
          <SearchIcon size={18} />
        </IconButton>
        <IconButton
          label={infoOpen ? 'Fechar informações' : 'Informações'}
          tipPos="bottom"
          onClick={onOpenInfo}
          aria-pressed={infoOpen}
          className={infoOpen ? styles.infoActive : undefined}
        >
          <InfoIcon size={18} />
        </IconButton>
      </div>
    </header>
  );
}

function subtitle(chat) {
  if (!chat) return '';
  if (chat.type === 'group') {
    const n = chat.member_count || (chat.members?.length ?? 0);
    return `${n} participante${n === 1 ? '' : 's'}`;
  }
  const partner = chat.partner;
  if (!partner) return '';
  // Bots não têm presença "online" tradicional — exibe o modelo Ollama em vez disso.
  if (partner.is_bot) return `Bot AI · ${partner.bot_model || 'modelo local'}`;
  if (partner.online) return 'on-line';
  if (partner.privacy_last_seen === 'nobody') return '';
  if (partner.last_seen_at) {
    const diff = Date.now() - partner.last_seen_at;
    const DAY = 86_400_000;
    const d = new Date(partner.last_seen_at);
    const hhmm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (diff < 60_000) return 'visto agora';
    if (diff < 3_600_000) return `visto há ${Math.floor(diff / 60_000)} min`;
    if (diff < DAY) return `visto hoje às ${hhmm}`;
    if (diff < 2 * DAY) return `visto ontem às ${hhmm}`;
    return `visto em ${d.toLocaleDateString('pt-BR')}`;
  }
  return '';
}
