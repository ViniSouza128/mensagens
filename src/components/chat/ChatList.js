'use client';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { useApp } from '@/store/AppStateProvider';
import ChatListItem from './ChatListItem';
import { Input } from '@/components/ui/Input';
import { SearchIcon, PlusIcon, ChatsIcon } from '@/components/icons/Icons';
import IconButton from '@/components/ui/IconButton';
import { ChatListSkeleton } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import styles from './ChatList.module.css';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import StoriesBar from './StoriesBar';
import dynamic from 'next/dynamic';
// Carregados sob demanda — economiza bundle inicial da página de conversas.
const StoryViewer   = dynamic(() => import('./StoryViewer'), { ssr: false });
const StoryComposer = dynamic(() => import('./StoryComposer'), { ssr: false });
const NewChatModalDyn = dynamic(() => import('./NewChatModal'), { ssr: false });

// Stories são uma feature visual — quando o backend implementar, virão de useApp().
// Por enquanto extraímos das partner photos dos chats diretos como demonstração.
// Inclui chat_id para permitir responder ao story diretamente.
function deriveStories(chats) {
  const stories = [];
  const seen = new Set();
  for (const c of chats) {
    if (c.type !== 'direct' || !c.partner) continue;
    const id = c.partner.id || c.partner.username;
    if (seen.has(id)) continue;
    seen.add(id);
    stories.push({
      id, name: c.partner.name || c.partner.username || 'Contato',
      avatar: c.partner.avatar_path || c.avatar_path,
      chat_id: c.id,
      seen: false,
    });
    if (stories.length >= 8) break;
  }
  return stories;
}

export default function ChatList() {
  const { chats, user: me, refreshChats } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [openNew, setOpenNew] = useState(false);
  const [storyIdx, setStoryIdx] = useState(null);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [myStories, setMyStories] = useState([]);
  const [mineViewerOpen, setMineViewerOpen] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  // Persistência leve em localStorage (stories são feature visual sem backend ainda)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('myStories');
      if (raw) setMyStories(JSON.parse(raw) || []);
    } catch {}
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem('myStories', JSON.stringify(myStories)); } catch {}
  }, [myStories]);
  const dq = useDebouncedValue(q, 150);

  // Considera "carregado" se já temos chats (cache hit instantâneo) ou após 600ms.
  useEffect(() => {
    if (chats.length > 0) { setLoadedOnce(true); return; }
    const t = setTimeout(() => setLoadedOnce(true), 600);
    return () => clearTimeout(t);
  }, [chats.length]);

  const filtered = useMemo(() => {
    if (!dq) return chats;
    const t = dq.toLowerCase();
    return chats.filter((c) => {
      if ((c.name || '').toLowerCase().includes(t)) return true;
      if ((c.last_message?.body || '').toLowerCase().includes(t)) return true;
      return false;
    });
  }, [chats, dq]);

  const activeId = (pathname || '').match(/^\/chats\/([^/]+)/)?.[1];

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className="h1">Conversas</h1>
        <IconButton label="Nova conversa" tipPos="bottom" onClick={() => setOpenNew(true)}><PlusIcon /></IconButton>
      </header>
      <div className={styles.search}>
        <span className={styles.searchIcon} aria-hidden><SearchIcon size={18} /></span>
        <Input placeholder="Buscar conversas e contatos" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" style={{ paddingLeft: 36 }} />
      </div>
      {chats.length > 0 ? (
        <StoriesBar
          stories={deriveStories(chats)}
          myStories={myStories}
          me={me}
          onPick={(id) => {
            const list = deriveStories(chats);
            const i = list.findIndex(s => s.id === id);
            if (i >= 0) setStoryIdx(i);
          }}
          onAdd={() => setStoryComposerOpen(true)}
          onPickMine={() => setMineViewerOpen(true)}
        />
      ) : null}
      <div className={styles.scroll} role="list" aria-label="Lista de conversas">
        {!loadedOnce ? (
          <ChatListSkeleton count={7} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ChatsIcon size={42} />}
            title={q ? 'Nada por aqui' : 'Nenhuma conversa ainda'}
            description={q ? 'Tente outro termo de busca.' : 'Inicie uma nova conversa pelo botão + no topo.'}
            action={!q ? { label: 'Nova conversa', onClick: () => setOpenNew(true) } : undefined}
            compact
          />
        ) : (
          filtered.map((c) => (
            <ChatListItem key={c.id} chat={c} active={c.id === activeId} />
          ))
        )}
      </div>
      {openNew ? <NewChatModalDyn open onClose={() => setOpenNew(false)} /> : null}
      {storyIdx !== null ? (
        <StoryViewer
          stories={deriveStories(chats)}
          index={storyIdx}
          onClose={() => setStoryIdx(null)}
          onReply={async (text, story) => {
            if (!story?.chat_id) return;
            try {
              await api.post(`/api/chats/${story.chat_id}/messages`, {
                type: 'text',
                body: `↩ Em resposta ao seu story:\n${text}`,
                attachments: [],
              });
              refreshChats();
              toast(`Resposta enviada para ${story.name?.split(' ')[0] || 'contato'}`, { tone: 'success' });
              router.push(`/chats/${story.chat_id}`);
            } catch (err) {
              toast('Não foi possível enviar a resposta.', { tone: 'error' });
            }
          }}
        />
      ) : null}
      {storyComposerOpen ? (
        <StoryComposer
          open
          onClose={() => setStoryComposerOpen(false)}
          onShare={(story) => setMyStories((prev) => [story, ...prev])}
        />
      ) : null}
      {mineViewerOpen && myStories.length > 0 ? (
        <StoryViewer
          mine
          stories={myStories.map((s) => ({
            id: s.id,
            type: s.type,
            text: s.text,
            image: s.image,
            bg: s.bg,
            name: me?.name || 'Você',
            avatar: me?.avatar_path,
            time: 'agora',
          }))}
          index={0}
          onClose={() => setMineViewerOpen(false)}
          onDelete={(_story, i) => {
            setMyStories((prev) => prev.filter((_, idx) => idx !== i));
          }}
        />
      ) : null}
    </div>
  );
}
