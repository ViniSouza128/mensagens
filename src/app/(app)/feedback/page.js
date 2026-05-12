'use client';
import { useState } from 'react';
import { api } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { Field, Input } from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import styles from './feedback.module.css';

const TOPICS = [
  { value: 'bug', label: 'Reportar bug' },
  { value: 'idea', label: 'Sugestão de melhoria' },
  { value: 'praise', label: 'Elogio' },
  { value: 'other', label: 'Outro' },
];

export default function FeedbackPage() {
  const { toast } = useToast();
  const [topic, setTopic] = useState('idea');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.post('/api/feedback', { topic, body });
      toast('Recebemos seu feedback. Obrigado!', { tone: 'success' });
      setBody('');
    } catch {
      toast('Não foi possível enviar.', { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className="h1">Fale conosco</h1>
        <p className="muted small">Conte o que você achou, o que está com problema ou o que poderia melhorar.</p>
      </header>

      <form className={styles.form} onSubmit={send}>
        <Field label="Assunto">
          {(id) => (
            <select id={id} className={styles.select} value={topic} onChange={(e) => setTopic(e.target.value)}>
              {TOPICS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Sua mensagem">
          {(id) => (
            <textarea
              id={id}
              className={styles.textarea}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Descreva com detalhes…"
              maxLength={4000}
              rows={8}
              required
            />
          )}
        </Field>
        <div className={styles.actions}>
          <Button type="submit" loading={busy} disabled={!body.trim()}>Enviar</Button>
        </div>
      </form>
    </div>
  );
}
