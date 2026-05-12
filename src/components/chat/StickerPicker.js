'use client';
import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import styles from './StickerPicker.module.css';

/**
 * Sticker picker — pacotes de PNGs grátis (Twemoji via jsDelivr CDN).
 * Twemoji é um conjunto de stickers/emoji em PNG mantido pelo Twitter/X
 * (licença CC-BY 4.0) servido publicamente em jsDelivr.
 *
 * Cada item gera uma URL determinística baseada no codepoint Unicode.
 * Quando o usuário escolhe, enviamos a URL como mensagem de tipo 'sticker',
 * o MessageBubble renderiza como <img> grande sem fundo de bolha.
 */
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/';

function emojiToCode(em) {
  // Remove variation selector (U+FE0F) que algumas combinações usam
  const codes = [];
  for (const ch of em) {
    const cp = ch.codePointAt(0);
    if (cp !== 0xfe0f) codes.push(cp.toString(16));
  }
  return codes.join('-');
}

function emojiToUrl(em) {
  return `${TWEMOJI_BASE}${emojiToCode(em)}.png`;
}

const PACKS = [
  {
    id: 'reactions',
    name: 'Reações',
    icon: '😀',
    items: ['😀','😂','🤣','😅','🥹','😍','🥰','😘','😎','🤩','🤯','😱','😭','🥺','🤔','😏','😴','🤤','😋','🤪','🥳','🤗','🙏','💪','👍','👎','👏','🙌','🫡','🫶'],
  },
  {
    id: 'love',
    name: 'Amor',
    icon: '❤️',
    items: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','💌','💋','😘','🥰','😍','💑','💏','💐','🌹','🌷','🌻'],
  },
  {
    id: 'celebrate',
    name: 'Festa',
    icon: '🎉',
    items: ['🎉','🎊','🎁','🎈','🎂','🍰','🧁','🥂','🍾','🍻','🥳','🎆','🎇','✨','🌟','⭐','🏆','🥇','🥈','🥉','🎖️','🏅','🎗️','💐','🌹','🎵','🎶','🎤','🎸','🥁'],
  },
  {
    id: 'animals',
    name: 'Bichos',
    icon: '🐶',
    items: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦅','🦉','🦄','🐢','🐍','🦎','🦖','🐙','🦑','🦐','🦞','🦀','🐳','🐬','🦋','🐝','🐞'],
  },
  {
    id: 'food',
    name: 'Comida',
    icon: '🍕',
    items: ['🍕','🍔','🍟','🌭','🥪','🌮','🌯','🥙','🍳','🥘','🍲','🥗','🍿','🥨','🧀','🥩','🍖','🍗','🥓','🍱','🍣','🍤','🍙','🍚','🍜','🍝','🍰','🎂','🧁','🍦','🍧','🍨','🍩','🍪','☕','🍷','🍺'],
  },
  {
    id: 'sports',
    name: 'Esportes',
    icon: '⚽',
    items: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🎱','🪀','🏓','🏸','🥊','🥋','⛳','🎣','🤿','🥽','🎿','🏂','🏄','🚴','🏃','🧘','🏊','🚣','⛷️','🏇','🤺','🤾','🏋️','🚵','🤸','🤽','🏆','🥇'],
  },
  {
    id: 'nature',
    name: 'Natureza',
    icon: '🌸',
    items: ['🌸','🌺','🌻','🌷','🌹','🥀','🌼','🌳','🌲','🌴','🌵','🍀','🍃','🍂','🍁','🌾','🌿','☘️','🌎','🌍','🌏','🌞','🌝','🌚','🌜','🌛','⭐','🌟','💫','✨','☀️','🌤️','⛅','☁️','🌧️','⛈️','🌈','❄️','☃️','⛄'],
  },
];

export default function StickerPicker({ open, onClose, onPick }) {
  const [packId, setPackId] = useState(PACKS[0].id);
  const pack = PACKS.find(p => p.id === packId) || PACKS[0];

  function handlePick(emoji) {
    const url = emojiToUrl(emoji);
    onPick?.({ url, alt: emoji });
    onClose?.();
  }

  return (
    <Modal open={open} onClose={onClose} title="Stickers" width={520}>
      <div className={styles.tabs}>
        {PACKS.map(p => (
          <button
            key={p.id}
            type="button"
            className={[styles.tab, packId === p.id ? styles.tabActive : ''].join(' ')}
            onClick={() => setPackId(p.id)}
            title={p.name}
          >
            <img
              src={emojiToUrl(p.icon)}
              alt={p.name}
              width={24}
              height={24}
              loading="lazy"
              className={styles.tabIcon}
            />
          </button>
        ))}
      </div>
      <div className={styles.packName}>{pack.name}</div>
      <div className={styles.grid}>
        {pack.items.map((s, i) => (
          <button
            key={`${packId}-${i}-${s}`}
            type="button"
            className={styles.cell}
            onClick={() => handlePick(s)}
            aria-label={`Sticker ${s}`}
          >
            <img
              src={emojiToUrl(s)}
              alt={s}
              width={64}
              height={64}
              loading="lazy"
              className={styles.cellImg}
            />
          </button>
        ))}
      </div>
      <div className={styles.hint}>💡 Stickers Twemoji (CC-BY 4.0) — PNGs grátis hospedados via jsDelivr.</div>
    </Modal>
  );
}
