'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import styles from './Toast.module.css';

const Ctx = createContext({ toast: () => {} });

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const remove = useCallback((id) => setItems((s) => s.filter((i) => i.id !== id)), []);
  const toast = useCallback((message, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    const tone = opts.tone || 'default';
    const duration = opts.duration ?? 3500;
    const action = opts.action || null;
    setItems((s) => [...s, { id, message, tone, action }]);
    if (duration > 0) setTimeout(() => remove(id), duration);
    return id;
  }, [remove]);
  return (
    <Ctx.Provider value={{ toast, dismiss: remove }}>
      {children}
      <div className={styles.host} aria-live="polite" aria-atomic="true">
        {items.map((t) => (
          <div key={t.id} className={[styles.toast, styles[`t_${t.tone}`]].join(' ')} role="status">
            <span className={styles.msg}>{t.message}</span>
            {t.action ? (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => { t.action.onClick?.(); remove(t.id); }}
              >
                {t.action.label}
              </button>
            ) : null}
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => remove(t.id)}
              aria-label="Fechar notificação"
            >×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() { return useContext(Ctx); }
