'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Field, Input } from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { api } from '@/services/api';
import styles from '../auth.module.css';

const ERR = {
  invalid_username: 'Usuário inválido (3-24 caracteres, letras, números, _ e .).',
  invalid_email: 'E-mail inválido.',
  invalid_password: 'Senha precisa ter ao menos 6 caracteres.',
  invalid_name: 'Informe seu nome.',
  user_exists: 'Usuário ou e-mail já em uso.',
  rate_limited: 'Muitas tentativas. Tente novamente em instantes.',
};

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const upd = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/api/auth/register', form);
      router.replace('/onboarding');
      router.refresh();
    } catch (err) {
      setError(ERR[err.code] || 'Não foi possível criar a conta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <h1 className="h1">Criar conta</h1>
      {error ? <div className={styles.error}>{error}</div> : null}
      <Field label="Nome">{(id) => (<Input id={id} value={form.name} onChange={upd('name')} autoComplete="name" required autoFocus />)}</Field>
      <Field label="Usuário" hint="Letras, números, ponto ou underline. 3 a 24 caracteres.">{(id) => (<Input id={id} value={form.username} onChange={upd('username')} autoComplete="username" required />)}</Field>
      <Field label="E-mail">{(id) => (<Input id={id} type="email" value={form.email} onChange={upd('email')} autoComplete="email" required />)}</Field>
      <Field label="Senha" hint="Mínimo de 6 caracteres.">{(id) => (<Input id={id} type="password" value={form.password} onChange={upd('password')} autoComplete="new-password" required />)}</Field>
      <Button type="submit" loading={loading} block size="lg">Criar conta</Button>
      <div className={styles.altRow}>
        <span>Já tem conta?</span>
        <Link href="/login">Entrar</Link>
      </div>
    </form>
  );
}
