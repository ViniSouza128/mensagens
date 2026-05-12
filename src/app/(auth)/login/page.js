'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Field, Input } from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { api } from '@/services/api';
import styles from '../auth.module.css';

const ERR = {
  invalid_credentials: 'Usuário ou senha inválidos.',
  banned: 'Sua conta foi banida.',
  suspended: 'Sua conta está suspensa temporariamente.',
  rate_limited: 'Muitas tentativas. Tente novamente em instantes.',
  missing_credentials: 'Informe usuário e senha.',
};

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/api/auth/login', { identifier, password });
      router.replace('/chats');
      router.refresh();
    } catch (err) {
      setError(ERR[err.code] || 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <h1 className="h1">Entrar</h1>
      {error ? <div className={styles.error}>{error}</div> : null}
      <Field label="Usuário ou e-mail">
        {(id) => (
          <Input id={id} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required autoFocus />
        )}
      </Field>
      <Field label="Senha">
        {(id) => (
          <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        )}
      </Field>
      <Button type="submit" loading={loading} block size="lg">Entrar</Button>
      <div className={styles.altRow}>
        <span>Não tem conta?</span>
        <Link href="/register">Criar conta</Link>
      </div>
    </form>
  );
}
