'use client';
import { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Avatar from '@/components/ui/Avatar';
import { useApp } from '@/store/AppStateProvider';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/services/api';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import { CheckIcon, SearchIcon } from '@/components/icons/Icons';
import styles from './ForwardModal.module.css';

export default function ForwardModal({ open, onClose, messageIds, onSent }) {
  const { chats } = useApp();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const dq = useDebouncedValue(q, 150);
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setPicked(new Set()); setQ(''); }
  }, [open]);

  const filtered = useMemo(() => {
    if (!dq) return chats;
    const t = dq.toLowerCase();
    return chats.filter((c) => (c.name || '').toLowerCase().includes(t));
  }, [chats, dq]);

  function toggle(id) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function send() {
    if (busy || picked.size === 0 || !messageIds?.length) return;
    setBusy(true);
    try {
      await api.post('/api/messages/forward', {
        message_ids: messageIds,
        chat_ids: [...picked],
      });
      toast('Encaminhada!', { tone: 'success' });
      onSent?.();
    } catch {
      toast('Falha ao encaminhar.', { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Encaminhar ${messageIds?.length || 0} mensagem${(messageIds?.length || 0) === 1 ? '' : 's'}`}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={send} loading={busy} disabled={picked.size === 0}>Encaminhar ({picked.size})</Button>
        </>
      }
    >
      <div className={styles.search}>
        <span className={styles.searchIcon}><SearchIcon size={16} /></span>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conversa…" style={{ paddingLeft: 32 }} />
      </div>
      <div className={styles.list} role="list">
        {filtered.length === 0 ? (
          <p className="muted small" style={{ padding: 12 }}>Nenhuma conversa encontrada.</p>
        ) : filtered.map((c) => {
          const sel = picked.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={[styles.item, sel ? styles.sel : ''].join(' ')}
              onClick={() => toggle(c.id)}
            >
              <Avatar name={c.name} src={c.avatar} size={36} />
              <span className={styles.name}>{c.name}</span>
              {sel ? <span className={styles.check}><CheckIcon size={16} /></span> : null}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
