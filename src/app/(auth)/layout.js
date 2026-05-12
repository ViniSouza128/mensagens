import styles from './auth.module.css';

export default function AuthLayout({ children }) {
  return (
    <div className={styles.shell}>
      <div className={styles.bg} aria-hidden />
      <main className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.logo} aria-hidden>M</div>
          <div>
            <div className={styles.title}>Mensagens</div>
            <div className={styles.subtitle}>Mensageria moderna, simples e segura</div>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
