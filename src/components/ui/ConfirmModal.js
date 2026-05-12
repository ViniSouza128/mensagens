'use client';
import Modal from './Modal';
import Button from './Button';
import styles from './ConfirmModal.module.css';

// Modal de confirmação genérico — para ações destrutivas ou irreversíveis que precisam de confirmação explícita.
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} width={380}>
      {message ? <p className={styles.message}>{message}</p> : null}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button danger={danger} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
