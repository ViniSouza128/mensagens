import styles from './empty.module.css';

export default function ChatsIndex() {
  return (
    <div className={styles.empty}>
      <div className={styles.bubble} aria-hidden>
        <svg viewBox="0 0 64 64" width="80" height="80" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M52 30c0 11-9 20-20 20-3 0-6-.7-9-2L12 50l2-9c-1.3-2.4-2-5.1-2-8 0-11 9-20 20-20s20 7 20 17z"/>
        </svg>
      </div>
      <h2 className="h2">Selecione uma conversa</h2>
      <p className="muted">
        Escolha uma conversa na lista ao lado ou inicie uma nova clicando no <strong>+</strong>.
      </p>
    </div>
  );
}
