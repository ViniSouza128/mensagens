'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import Switch from '@/components/ui/Switch';
import { api } from '@/services/api';
import styles from '../auth.module.css';

const STEPS = ['perfil', 'privacidade', 'aparencia'];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [me, setMe] = useState(null);
  const [bio, setBio] = useState('');
  const [name, setName] = useState('');
  const [readReceipts, setReadReceipts] = useState(true);
  const [blockUnknown, setBlockUnknown] = useState(false);
  const [theme, setTheme] = useState('auto');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/api/auth/me').then((u) => {
      if (!u) {
        router.replace('/login');
        return;
      }
      setMe(u);
      setName(u.name || '');
      setBio(u.bio || '');
      setReadReceipts(u.read_receipts !== false);
      setBlockUnknown(!!u.block_unknown);
      setTheme(u.theme || 'auto');
    });
  }, [router]);

  if (!me) return null;

  async function next() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      setLoading(true);
      try {
        await api.patch('/api/users/me', {
          name, bio,
          read_receipts: readReceipts,
          block_unknown: blockUnknown,
          theme,
          onboarded: true,
        });
        router.replace('/chats');
        router.refresh();
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className={styles.form}>
      <h1 className="h1">Bem-vindo, {me.name?.split(' ')[0]}!</h1>
      <p className="muted small">Configure rápido seu perfil para começar.</p>

      {step === 0 ? (
        <>
          <Field label="Como você quer ser chamado">{(id) => (<Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />)}</Field>
          <Field label="Bio (opcional)">{(id) => (<Textarea id={id} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={3} />)}</Field>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <Switch label="Confirmação de leitura" checked={readReceipts} onChange={setReadReceipts} />
          <Switch label="Bloquear mensagens de desconhecidos" checked={blockUnknown} onChange={setBlockUnknown} />
          <p className="muted xs">Pessoas fora da sua lista de contatos enviarão uma solicitação discreta.</p>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Field label="Tema">
            <div className="row">
              {[['auto','Automático'], ['light','Claro'], ['dark','Escuro']].map(([v, l]) => (
                <Button key={v} variant={theme === v ? 'solid' : 'outline'} size="sm" onClick={() => setTheme(v)}>{l}</Button>
              ))}
            </div>
          </Field>
          <p className="muted xs">Você poderá mudar mais opções em Configurações.</p>
        </>
      ) : null}

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 'var(--space-3)' }}>
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Voltar</Button>
        <Button onClick={next} loading={loading}>{step === STEPS.length - 1 ? 'Concluír' : 'Próximo'}</Button>
      </div>
    </div>
  );
}
