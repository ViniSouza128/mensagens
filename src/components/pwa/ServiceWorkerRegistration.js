'use client';
import { useEffect } from 'react';

/**
 * Registra o service worker quando o componente monta.
 * Colocado no RootLayout para garantir execução em toda a app.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Verifica atualização ao focar na aba
        window.addEventListener('focus', () => reg.update().catch(() => {}), { once: false });
      })
      .catch(() => {
        // Ignora falhas de registro (ex: em dev sem HTTPS)
      });
  }, []);

  return null;
}
