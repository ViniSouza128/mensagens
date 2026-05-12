'use client';
import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import IconButton from '@/components/ui/IconButton';
import { PlusIcon, XIcon } from '@/components/icons/Icons';

/**
 * Modal para criar uma enquete.
 * Props: open, onClose, onSubmit({ question, options, multiple, anonymous })
 */
export default function PollComposerModal({ open, onClose, onSubmit }) {
  const [question, setQuestion] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);

  function setOpt(i, v) { setOpts(o => o.map((x, idx) => idx === i ? v : x)); }
  function addOpt() { if (opts.length < 10) setOpts([...opts, '']); }
  function rmOpt(i) { if (opts.length > 2) setOpts(o => o.filter((_, idx) => idx !== i)); }

  function submit() {
    const cleanOpts = opts.map(o => o.trim()).filter(Boolean);
    const q = question.trim();
    if (!q || cleanOpts.length < 2) return;
    onSubmit({
      question: q,
      options: cleanOpts.map(label => ({ label, votes: 0 })),
      total: 0,
      multiple, anonymous,
    });
    setQuestion(''); setOpts(['', '']); setMultiple(false); setAnonymous(false);
  }

  function close() { onClose?.(); setQuestion(''); setOpts(['', '']); }

  return (
    <Modal open={open} onClose={close} title="Nova enquete" width={460}
      footer={(
        <>
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={!question.trim() || opts.filter(o => o.trim()).length < 2}>
            Criar enquete
          </Button>
        </>
      )}
    >
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Pergunta</label>
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ex: Quando vamos almoçar?" autoFocus />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Opções</label>
        {opts.map((o, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
            <Input value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={`Opção ${i + 1}`} style={{ flex: 1 }} />
            {opts.length > 2 ? (
              <IconButton label="Remover opção" onClick={() => rmOpt(i)}><XIcon size={14} /></IconButton>
            ) : null}
          </div>
        ))}
        {opts.length < 10 ? (
          <Button variant="ghost" size="sm" onClick={addOpt} iconLeft={<PlusIcon size={14} />}>Adicionar opção</Button>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
          Permitir múltipla escolha
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
          Anônima (não mostra quem votou)
        </label>
      </div>
    </Modal>
  );
}
