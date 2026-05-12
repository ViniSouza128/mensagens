'use client';
import { PlusIcon } from '@/components/icons/Icons';
import Avatar from '@/components/ui/Avatar';
import styles from './StoriesBar.module.css';

/**
 * Barra de stories no topo da chat list.
 *
 * Props:
 *   stories:    [{ id, name, avatar, seen }]
 *   myStories:  [{ id, type, text, image, bg, createdAt }]  — stories do próprio usuário
 *   me:         { id, name, avatar_path }
 *   onPick:     (storyId) => void                     — clique em story de outro
 *   onAdd:      () => void                            — clique em "+ Você"
 *   onPickMine: () => void                            — clique no avatar próprio (com stories)
 */
export default function StoriesBar({ stories = [], myStories = [], me, onPick, onAdd, onPickMine }) {
  const hasMine = myStories.length > 0;
  return (
    <div className={styles.stories} role="list" aria-label="Stories">
      <button
        type="button"
        className={styles.story}
        onClick={hasMine ? onPickMine : onAdd}
        role="listitem"
        aria-label={hasMine ? 'Ver meus stories' : 'Adicionar story'}
      >
        {hasMine ? (
          <div className={[styles.ring, styles.ringMine].join(' ')}>
            <Avatar name={me?.name || 'Você'} src={me?.avatar_path} size={48} />
            <span className={styles.addBadge} aria-hidden>+</span>
          </div>
        ) : (
          <div className={[styles.ring, styles.ringAdd].join(' ')}>
            <PlusIcon size={20} />
          </div>
        )}
        <span className={styles.name}>{hasMine ? 'Seu story' : 'Você'}</span>
      </button>
      {stories.map(s => (
        <button
          key={s.id}
          type="button"
          className={styles.story}
          onClick={() => onPick?.(s.id)}
          role="listitem"
        >
          <div className={[styles.ring, s.seen ? styles.ringSeen : ''].join(' ')}>
            <Avatar name={s.name} src={s.avatar} size={48} />
          </div>
          <span className={styles.name}>{s.name}</span>
        </button>
      ))}
    </div>
  );
}
