'use client';
import { useApp } from '@/store/AppStateProvider';
import ChatListItem from '@/components/chat/ChatListItem';
import styles from './archived.module.css';

export default function ArchivedPage() {
  const { archivedChats } = useApp();
  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className="h1">Conversas arquivadas</h1>
      </header>
      <div className={styles.list} role="list">
        {archivedChats.length === 0 ? (
          <div className={styles.empty}>
            <p className="muted small">Nenhuma conversa arquivada.</p>
            <p className="faint xs">Arquivar conversas ajuda a manter sua lista limpa.</p>
          </div>
        ) : (
          archivedChats.map((c) => <ChatListItem key={c.id} chat={c} />)
        )}
      </div>
    </div>
  );
}
