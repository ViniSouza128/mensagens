'use client';
import { useState, useRef, useEffect } from 'react';
import { PlayIcon, PauseIcon, DownloadIcon } from '@/components/icons/Icons';
import styles from './VoiceMessage.module.css';

/**
 * Voice message bubble — player com waveform + duração.
 * Props:
 *   src: URL do áudio (opcional — sem src usa demo synth)
 *   duration: string formato "0:42"
 *   wave: waveform inicial (array de pesos 0-1, opcional)
 *   mine: bool — true = bubble enviada (gradient)
 */
export default function VoiceMessage({ src, duration = '0:00', wave, mine = false }) {
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(0); // 0..1
  const audioRef = useRef(null);
  const rafRef = useRef(null);

  // Waveform: usa peso fornecido ou gera padrão
  const bars = wave || Array.from({ length: 28 }, (_, i) =>
    .15 + Math.abs(Math.sin(i * .8 + (i % 3))) * .85
  );

  function toggle() {
    if (!audioRef.current) {
      // sem áudio real, simula playback
      if (playing) {
        cancelAnimationFrame(rafRef.current);
        setPlaying(false);
      } else {
        setPlaying(true);
        const total = parseDuration(duration) * 1000 || 4000;
        const start = performance.now() - played * total;
        const tick = (t) => {
          const p = Math.min(1, (t - start) / total);
          setPlayed(p);
          if (p < 1) rafRef.current = requestAnimationFrame(tick);
          else { setPlaying(false); setPlayed(0); }
        };
        rafRef.current = requestAnimationFrame(tick);
      }
      return;
    }
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  }

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setPlayed(a.currentTime / (a.duration || 1));
    const onEnd = () => { setPlaying(false); setPlayed(0); };
    a.addEventListener('play', () => setPlaying(true));
    a.addEventListener('pause', () => setPlaying(false));
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className={[styles.voice, mine ? styles.mine : ''].join(' ')}>
      <button className={styles.play} onClick={toggle} aria-label={playing ? 'Pausar' : 'Tocar'}>
        {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
      </button>
      <div className={styles.wave} aria-hidden>
        {bars.map((h, i) => {
          const isPlayed = i / bars.length < played;
          return <span key={i} className={[styles.bar, isPlayed ? styles.barPlayed : ''].join(' ')} style={{ height: `${4 + h * 22}px` }} />;
        })}
      </div>
      <span className={styles.time}>{duration}</span>
      {src ? (
        <a
          href={`${src}${src.includes('?') ? '&' : '?'}download=1`}
          className={styles.download}
          download
          aria-label="Baixar áudio"
          title="Baixar áudio"
          onClick={(e) => e.stopPropagation()}
        >
          <DownloadIcon size={14} />
        </a>
      ) : null}
      {src ? <audio ref={audioRef} src={src} preload="metadata" /> : null}
    </div>
  );
}

function parseDuration(s) {
  if (!s) return 0;
  const [m, sec] = s.split(':').map(Number);
  return (m || 0) * 60 + (sec || 0);
}
