'use client';
import Avatar from '@/components/ui/Avatar';
import { ChatsIcon } from '@/components/icons/Icons';
import styles from './EmptyChat.module.css';

const SUGGESTIONS = [
  '👋 Oi!',
  'Tudo bem?',
  'Fala aí 😊',
  '🎉 E aí, novidades?',
];

// Composes a friendly empty state for a chat with no messages yet.
// Doesn't actually send the message — clicking a suggestion focuses
// the composer and pre-fills it via a custom event.
export default function EmptyChat({ chat }) {
  const name = chat?.name || 'esta conversa';
  const isGroup = chat?.type === 'group';

  function pick(text) {
    // Composer listens via window event for prefill suggestions
    window.dispatchEvent(new CustomEvent('mensagens:composer.prefill', { detail: text }));
  }

  return (
    <div className={styles.wrap}>
      {chat?.avatar_path ? (
        <Avatar name={chat.name} src={chat.avatar_path} size={88} />
      ) : (
        <div className={styles.iconBubble}><ChatsIcon size={36} /></div>
      )}
      <h3 className={styles.title}>
        {isGroup ? `Bem-vindo a ${name}` : `Diga olá para ${name}`}
      </h3>
      <p className={styles.desc}>
        {isGroup
          ? 'Esta é uma conversa em grupo. Quebre o gelo com uma mensagem!'
          : 'Comece a conversa enviando uma mensagem ou escolhendo uma sugestão abaixo.'}
      </p>
      {!isGroup ? (
        <div className={styles.suggestions}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={styles.chip}
              onClick={() => pick(s)}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
