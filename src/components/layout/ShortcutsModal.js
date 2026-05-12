'use client';
import Modal from '@/components/ui/Modal';
import styles from './ShortcutsModal.module.css';

const SECTIONS = [
  {
    title: 'Geral',
    items: [
      { keys: ['Ctrl', 'K'], desc: 'Buscar (mensagens, chats, contatos)' },
      { keys: ['?'], desc: 'Mostrar este painel de atalhos' },
      { keys: ['Esc'], desc: 'Fechar diálogos / cancelar edição' },
    ],
  },
  {
    title: 'Conversa',
    items: [
      { keys: ['Enter'], desc: 'Enviar mensagem (se "Enviar com Enter" ativado)' },
      { keys: ['Shift', 'Enter'], desc: 'Quebra de linha' },
      { keys: ['↑', '↓'], desc: 'Navegar mensagens (em foco)' },
    ],
  },
  {
    title: 'Mensagem',
    items: [
      { keys: ['Botão direito'], desc: 'Abrir menu de ações' },
      { keys: ['Long-press'], desc: 'Abrir menu no mobile' },
    ],
  },
  {
    title: 'Mídia (lightbox)',
    items: [
      { keys: ['←', '→'], desc: 'Navegar entre mídias' },
      { keys: ['+', '−'], desc: 'Zoom in/out' },
      { keys: ['0'], desc: 'Resetar zoom' },
      { keys: ['Esc'], desc: 'Fechar' },
    ],
  },
  {
    title: 'Texto',
    items: [
      { keys: ['**texto**'], desc: 'Negrito' },
      { keys: ['_texto_'], desc: 'Itálico' },
      { keys: ['~~texto~~'], desc: 'Tachado' },
      { keys: ['`código`'], desc: 'Inline code' },
      { keys: ['> texto'], desc: 'Citação' },
    ],
  },
];

export default function ShortcutsModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Atalhos do teclado" width={560}>
      <div className={styles.grid}>
        {SECTIONS.map((s) => (
          <section key={s.title} className={styles.section}>
            <h3 className={styles.h3}>{s.title}</h3>
            <ul className={styles.list}>
              {s.items.map((it, i) => (
                <li key={i} className={styles.item}>
                  <span className={styles.desc}>{it.desc}</span>
                  <span className={styles.keys}>
                    {it.keys.map((k, ki) => (
                      <kbd key={ki} className={styles.kbd}>{k}</kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
