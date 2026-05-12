'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDownIcon, ReplyIcon, ForwardIcon, CopyIcon, StarIcon, PinIcon,
  EditIcon, TrashIcon, FlagIcon, InfoIcon, CheckIcon,
} from '@/components/icons/Icons';
import styles from './MessageChevronMenu.module.css';

/**
 * Chevron-only no canto superior direito da bolha (clone WhatsApp Web).
 *
 * - Fica oculto por padrão; aparece no hover/focus da bolha (CSS em
 *   MessageBubble.module.css via [data-message-chevron]).
 * - Click abre menu via REACT PORTAL no document.body com `position: fixed`
 *   e top/left CLAMPED à viewport — nunca renderiza fora da tela.
 * - Recalcula posição em resize e scroll.
 * - Reações vivem em outro botão (MessageReactButton); este menu tem
 *   APENAS itens de ação (Dados, Responder, Copiar, Encaminhar, Fixar,
 *   Favoritar, Selecionar, Editar, Apagar/Denunciar).
 */
const MENU_W = 240;
const PAD = 8;

export default function MessageChevronMenu({
  msg, isMine, isPinned, canEdit,
  onReply, onForward, onStar, onPin, onEdit, onDelete, onDeleteForMe, onReport, onDetails,
  onCopy, onSelect,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onWin = () => recompute();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function recompute() {
    const trig = triggerRef.current?.getBoundingClientRect();
    if (!trig) return;
    const m = menuRef.current?.getBoundingClientRect();
    const mh = m?.height || 320;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = trig.bottom + 6;
    let originY = 'top';
    if (top + mh > vh - PAD && trig.top - mh - 6 > PAD) {
      top = trig.top - mh - 6;
      originY = 'bottom';
    }
    top = Math.max(PAD, Math.min(top, vh - mh - PAD));
    let left = isMine ? (trig.right - MENU_W) : trig.left;
    left = Math.max(PAD, Math.min(left, vw - MENU_W - PAD));
    setPos({ top, left, originY });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-message-chevron
        className={[styles.chevron, open ? styles.chevronOpen : ''].join(' ')}
        onClick={(e) => { e.stopPropagation(); setOpen((s) => !s); }}
        aria-label="Opções da mensagem"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Opções"
      >
        <ChevronDownIcon size={14} />
      </button>

      {open && mounted ? createPortal(
        <div
          ref={menuRef}
          className={styles.menu}
          role="menu"
          style={pos ? {
            top: pos.top,
            left: pos.left,
            width: MENU_W,
            transformOrigin: pos.originY === 'bottom' ? 'bottom right' : 'top right',
          } : { visibility: 'hidden', top: 0, left: 0, width: MENU_W }}
        >
          <button className={styles.item} role="menuitem" onClick={() => { setOpen(false); onDetails?.(msg); }}>
            <InfoIcon size={16} /> Dados da mensagem
          </button>
          {/* "Responder" não faz sentido pra mensagens de IA — o bot não
              entende citação/quote nem reage diferente. Esconde quando
              msg.bot=true (campo do extra setado por src/server/llm/bots.js). */}
          {!msg.bot ? (
            <button className={styles.item} role="menuitem" onClick={() => { setOpen(false); onReply?.(msg); }}>
              <ReplyIcon size={16} /> Responder
            </button>
          ) : null}
          {msg.body ? (
            <button className={styles.item} role="menuitem" onClick={() => { setOpen(false); onCopy?.(); }}>
              <CopyIcon size={16} /> Copiar
            </button>
          ) : null}
          <button className={styles.item} role="menuitem" onClick={() => { setOpen(false); onForward?.(msg); }}>
            <ForwardIcon size={16} /> Encaminhar
          </button>
          <button className={styles.item} role="menuitem" onClick={() => { setOpen(false); onPin?.(msg, !isPinned); }}>
            <PinIcon size={16} /> {isPinned ? 'Desafixar' : 'Fixar'}
          </button>
          <button className={styles.item} role="menuitem" onClick={() => { setOpen(false); onStar?.(msg, !msg.starred); }}>
            <StarIcon size={16} /> {msg.starred ? 'Remover dos favoritos' : 'Favoritar'}
          </button>
          <button className={styles.item} role="menuitem" onClick={() => { setOpen(false); onSelect?.(msg); }}>
            <CheckIcon size={16} /> Selecionar
          </button>
          {isMine && canEdit ? (
            <button className={styles.item} role="menuitem" onClick={() => { setOpen(false); onEdit?.(msg); }}>
              <EditIcon size={16} /> Editar
            </button>
          ) : null}
          <div className={styles.divider} />
          {/* "Apagar para mim" — disponível pra QUALQUER mensagem (própria ou
              de outro). A mensagem some só pra este usuário; os outros membros
              continuam vendo. Diferente de "Apagar" (legado, abaixo) que
              marca deletada pra todos e exige autoria. */}
          <button className={styles.item} role="menuitem" onClick={() => { setOpen(false); onDeleteForMe?.(msg); }}>
            <TrashIcon size={16} /> Apagar para mim
          </button>
          {isMine ? (
            <button className={[styles.item, styles.itemDanger].join(' ')} role="menuitem" onClick={() => { setOpen(false); onDelete?.(msg); }}>
              <TrashIcon size={16} /> Apagar para todos
            </button>
          ) : (
            <button className={[styles.item, styles.itemDanger].join(' ')} role="menuitem" onClick={() => { setOpen(false); onReport?.(msg); }}>
              <FlagIcon size={16} /> Denunciar
            </button>
          )}
        </div>,
        document.body
      ) : null}
    </>
  );
}
