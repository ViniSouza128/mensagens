'use client';
import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { api } from '@/services/api';
import { formatFullDate } from '@/lib/time';
import styles from './MessageDetailsModal.module.css';

export default function MessageDetailsModal({ open, onClose, message }) {
  const [details, setDetails] = useState(null);
  const [edits, setEdits] = useState([]);

  useEffect(() => {
    if (!open || !message) { setDetails(null); setEdits([]); return; }
    api.get(`/api/messages/${message.id}`).then((d) => {
      setDetails(d.message || message);
      setEdits((d.edits || []).map((e) => ({ body: e.body_before, edited_at: e.edited_at })));
    }).catch(() => { setDetails(message); setEdits([]); });
  }, [open, message]);

  if (!open || !message) return null;
  const m = details || message;

  return (
    <Modal open={open} onClose={onClose} title="Detalhes da mensagem" width={520}>
      <dl className={styles.list}>
        <Item label="Enviada em" value={formatFullDate(m.created_at)} />
        {m.delivered_at ? <Item label="Entregue em" value={formatFullDate(m.delivered_at)} /> : null}
        {m.read_at ? <Item label="Lida em" value={formatFullDate(m.read_at)} /> : null}
        {m.edited_at ? <Item label="Editada em" value={formatFullDate(m.edited_at)} /> : null}
        <Item label="Tipo" value={typeLabel(m.type)} />
        {m.attachments?.length ? <Item label="Anexos" value={`${m.attachments.length}`} /> : null}
      </dl>

      {edits.length > 0 ? (
        <>
          <h3 className={styles.h3}>Histórico de edições</h3>
          <ul className={styles.edits}>
            {edits.map((e, i) => (
              <li key={i} className={styles.edit}>
                <div className={styles.editTime}>{formatFullDate(e.edited_at)}</div>
                <div className={styles.editBody}>{e.body || <em>Sem texto</em>}</div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Modal>
  );
}

function Item({ label, value }) {
  return (
    <>
      <dt className={styles.dt}>{label}</dt>
      <dd className={styles.dd}>{value}</dd>
    </>
  );
}

function typeLabel(t) {
  const map = { text: 'Texto', image: 'Imagem', video: 'Vídeo', audio: 'Áudio', file: 'Arquivo', gif: 'GIF' };
  return map[t] || t;
}
