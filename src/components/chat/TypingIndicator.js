'use client';
import styles from './TypingIndicator.module.css';

/**
 * Indicador de "digitando…" / "pensando…".
 *
 * `entries` é uma lista de objetos `{ name, thinking }` (não mais só strings):
 *  - `thinking=true` (bots LLM enquanto chamam o Ollama) → exibe "pensando…"
 *  - `thinking=false` (humanos OU bot já recebeu resposta e tá compondo o
 *    próximo chunk) → exibe "digitando…"
 *
 * Se *qualquer* entrada estiver pensando, o rótulo agregado vira "pensando" —
 * casa com a percepção do usuário (algo lento está acontecendo).
 */
export default function TypingIndicator({ entries = [] }) {
  const norm = entries.map((e) => (typeof e === 'string' ? { name: e, thinking: false } : e));
  const names = norm.map((e) => e.name).filter(Boolean);
  const anyThinking = norm.some((e) => e.thinking);
  const verb = anyThinking ? 'pensando' : 'digitando';
  const who = labelFor(names);
  return (
    <div className={styles.row} aria-live="polite" aria-label={`${who} está ${verb}`}>
      <div className={styles.bubble}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
      {who ? <span className={styles.who}>{who} {verb}…</span> : null}
    </div>
  );
}

function labelFor(names) {
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} e ${names[1]}`;
  return `${names[0]} e mais ${names.length - 1}`;
}
