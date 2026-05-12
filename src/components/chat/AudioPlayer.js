'use client';
import { useEffect, useRef, useState } from 'react';
import { PlayIcon, PauseIcon } from '@/components/icons/Icons';
import styles from './AudioPlayer.module.css';

function fmt(seconds) {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AudioPlayer({ src, mime, durationMs }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationMs ? durationMs / 1000 : NaN);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onMeta = () => { setDuration(a.duration); setLoaded(true); };
    const onTime = () => setCurrent(a.currentTime);
    const onEnd = () => { setPlaying(false); setCurrent(0); if (a) a.currentTime = 0; };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    return () => {
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
    };
  }, []);

  // reset when src changes
  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setLoaded(false);
    setDuration(durationMs ? durationMs / 1000 : NaN);
  }, [src, durationMs]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play().catch(() => {});
  }

  function seek(e) {
    const a = audioRef.current;
    if (!a) return;
    const d = isFinite(duration) ? duration : (a.duration || 0);
    if (!d) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = frac * d;
  }

  const d = isFinite(duration) ? duration : 0;
  const progress = d ? (current / d) * 100 : 0;

  return (
    <div className={styles.wrap}>
      {/* hidden audio element */}
      <audio ref={audioRef} preload="metadata" style={{ display: 'none' }}>
        <source src={src} type={mime || 'audio/mpeg'} />
      </audio>

      <button
        type="button"
        className={styles.playBtn}
        onClick={toggle}
        aria-label={playing ? 'Pausar' : 'Reproduzir'}
      >
        {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
      </button>

      <div className={styles.right}>
        {/* seekable progress bar */}
        <div
          className={styles.barTrack}
          onClick={seek}
          role="slider"
          aria-label="Progresso"
          aria-valuemin={0}
          aria-valuemax={d}
          aria-valuenow={current}
          tabIndex={0}
          onKeyDown={(e) => {
            const a = audioRef.current;
            if (!a) return;
            if (e.key === 'ArrowRight') a.currentTime = Math.min(d, current + 5);
            if (e.key === 'ArrowLeft') a.currentTime = Math.max(0, current - 5);
            if (e.key === ' ') { e.preventDefault(); toggle(); }
          }}
        >
          <div className={styles.barFill} style={{ width: `${progress}%` }} />
          <div className={styles.barThumb} style={{ left: `${progress}%` }} />
        </div>
        <div className={styles.time}>
          <span>{fmt(current)}</span>
          <span>{fmt(d)}</span>
        </div>
      </div>
    </div>
  );
}
