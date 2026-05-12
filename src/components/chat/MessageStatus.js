'use client';
import { CheckIcon, DoubleCheckIcon, ClockIcon, AlertIcon } from '@/components/icons/Icons';
import styles from './MessageStatus.module.css';

export default function MessageStatus({ status }) {
  if (status === 'sending') return <span className={styles.s}><ClockIcon size={14} /></span>;
  if (status === 'failed')  return <span className={[styles.s, styles.failed].join(' ')} title="Falhou"><AlertIcon size={14} /></span>;
  if (status === 'sent')    return <span className={styles.s}><CheckIcon size={14} /></span>;
  if (status === 'delivered') return <span className={styles.s}><DoubleCheckIcon size={14} /></span>;
  if (status === 'read')    return <span className={[styles.s, styles.read].join(' ')}><DoubleCheckIcon size={14} /></span>;
  return null;
}
