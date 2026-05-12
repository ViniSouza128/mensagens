'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Modal from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { SearchIcon, XIcon } from '@/components/icons/Icons';
import styles from './GifPicker.module.css';

/* Tenor public anonymous endpoint — não requer chave para uso modesto.
   Cada chamada retorna 30 GIFs em formato MP4 + GIF. */
const TENOR_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ'; // chave demo pública do Google Tenor
const TENOR_BASE = 'https://tenor.googleapis.com/v2';

const TRENDING_TERMS = ['hello', 'thumbs up', 'love', 'laughing', 'happy', 'wow', 'sad', 'fire'];

/**
 * Modal GIF picker — busca via Tenor.
 * Props:
 *   open, onClose
 *   onPick(gif) — gif tem { url, preview, width, height }
 */
export default function GifPicker({ open, onClose, onPick }) {
  const [q, setQ] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debRef = useRef(null);

  const fetchGifs = useCallback(async (term) => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = term
        ? `${TENOR_BASE}/search?q=${encodeURIComponent(term)}&key=${TENOR_KEY}&client_key=mensagens&limit=24&media_filter=gif,tinygif`
        : `${TENOR_BASE}/featured?key=${TENOR_KEY}&client_key=mensagens&limit=24&media_filter=gif,tinygif`;
      const r = await fetch(endpoint);
      if (!r.ok) throw new Error('fetch failed');
      const data = await r.json();
      const list = (data.results || []).map(it => ({
        id: it.id,
        url: it.media_formats?.gif?.url || it.media_formats?.tinygif?.url,
        preview: it.media_formats?.tinygif?.url || it.media_formats?.gif?.url,
        width: it.media_formats?.gif?.dims?.[0] || 200,
        height: it.media_formats?.gif?.dims?.[1] || 200,
        title: it.content_description || it.title || '',
      })).filter(g => g.url);
      setGifs(list);
    } catch (e) {
      setError('Não foi possível carregar GIFs. Tente novamente.');
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Featured ao abrir
  useEffect(() => {
    if (open) fetchGifs('');
  }, [open, fetchGifs]);

  // Debounce search
  useEffect(() => {
    if (!open) return;
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => {
      if (q.trim()) fetchGifs(q.trim());
      else fetchGifs('');
    }, 350);
    return () => clearTimeout(debRef.current);
  }, [q, open, fetchGifs]);

  return (
    <Modal open={open} onClose={onClose} title="Escolher GIF" width={560}>
      <div className={styles.search}>
        <SearchIcon size={16} className={styles.searchIcon} />
        <Input
          placeholder="Buscar GIFs (ex: feliz, parabéns, festa)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          style={{ paddingLeft: 36 }}
        />
        {q ? (
          <button type="button" className={styles.clearBtn} onClick={() => setQ('')} aria-label="Limpar">
            <XIcon size={14} />
          </button>
        ) : null}
      </div>

      {!q ? (
        <div className={styles.tags}>
          {TRENDING_TERMS.map(t => (
            <button key={t} type="button" className={styles.tag} onClick={() => setQ(t)}>{t}</button>
          ))}
        </div>
      ) : null}

      <div className={styles.grid}>
        {loading ? (
          Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={styles.skel} />
          ))
        ) : error ? (
          <div className={styles.empty}>{error}</div>
        ) : gifs.length === 0 ? (
          <div className={styles.empty}>Nenhum GIF encontrado.</div>
        ) : (
          gifs.map(g => (
            <button
              key={g.id}
              type="button"
              className={styles.cell}
              onClick={() => { onPick?.(g); onClose?.(); }}
              title={g.title}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.preview} alt={g.title} loading="lazy" />
            </button>
          ))
        )}
      </div>

      <div className={styles.credit}>Powered by Tenor</div>
    </Modal>
  );
}
