'use client';
import { useEffect, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { CameraIcon, VideoIcon, RotateIcon, XIcon } from '@/components/icons/Icons';
import styles from './CameraCapture.module.css';

/**
 * Captura de foto/vídeo via webcam (getUserMedia + MediaRecorder).
 *
 * Props:
 *   open:     bool
 *   onClose:  () => void
 *   onCapture:(file: File, kind: 'image'|'video') => void
 */
export default function CameraCapture({ open, onClose, onCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const [mode, setMode] = useState('photo'); // 'photo' | 'video'
  const [facing, setFacing] = useState('user'); // 'user' | 'environment'
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null); // { url, blob, kind }

  // Inicia/para câmera
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setPreview(null);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: mode === 'video',
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (e) {
        setError(e?.message || 'Não foi possível acessar a câmera.');
      }
    })();
    return () => {
      cancelled = true;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing, mode]);

  function stopAll() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch {}
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    setRecSec(0);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  function snapPhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 540;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (facing === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      setPreview({ url, blob, file, kind: 'image' });
    }, 'image/jpeg', 0.92);
  }

  function startVideo() {
    if (!streamRef.current) return;
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';
    chunksRef.current = [];
    try {
      const rec = new MediaRecorder(streamRef.current, { mimeType: mime });
      recorderRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        const file = new File([blob], `video-${Date.now()}.webm`, { type: mime });
        const url = URL.createObjectURL(blob);
        setPreview({ url, blob, file, kind: 'video' });
      };
      rec.start(250);
      setRecording(true);
      setRecSec(0);
      timerRef.current = setInterval(() => setRecSec((s) => s + 1), 1000);
    } catch (e) {
      setError('Falha ao iniciar gravação: ' + e.message);
    }
  }

  function stopVideo() {
    try { recorderRef.current?.stop(); } catch {}
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  }

  function confirmSend() {
    if (!preview) return;
    onCapture?.(preview.file, preview.kind);
    setPreview(null);
    onClose?.();
  }

  function discardPreview() {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  function handleClose() {
    stopAll();
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
    onClose?.();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Câmera" width={640}
      footer={preview ? (
        <>
          <Button variant="ghost" onClick={discardPreview}>Tirar outra</Button>
          <Button variant="primary" onClick={confirmSend}>Enviar</Button>
        </>
      ) : null}
    >
      <div className={styles.modes}>
        <button
          type="button"
          className={[styles.modeBtn, mode === 'photo' ? styles.modeActive : ''].join(' ')}
          onClick={() => { discardPreview(); setMode('photo'); }}
          disabled={recording}
        >
          <CameraIcon size={16} /> Foto
        </button>
        <button
          type="button"
          className={[styles.modeBtn, mode === 'video' ? styles.modeActive : ''].join(' ')}
          onClick={() => { discardPreview(); setMode('video'); }}
          disabled={recording}
        >
          <VideoIcon size={16} /> Vídeo
        </button>
      </div>

      <div className={styles.stage}>
        {error ? (
          <div className={styles.error}>
            <strong>Erro:</strong> {error}
            <p>Conceda permissão à câmera no navegador e tente novamente.</p>
          </div>
        ) : preview ? (
          preview.kind === 'image'
            ? <img src={preview.url} alt="Pré-visualização" className={styles.media} />
            : <video src={preview.url} controls className={styles.media} />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={[styles.media, facing === 'user' ? styles.mirror : ''].join(' ')}
          />
        )}
        {recording ? (
          <div className={styles.recBadge}>
            <span className={styles.recDot} aria-hidden /> REC {fmt(recSec)}
          </div>
        ) : null}
        <canvas ref={canvasRef} hidden />
      </div>

      {!preview && !error ? (
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.flipBtn}
            onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
            disabled={recording}
            aria-label="Inverter câmera"
          >
            <RotateIcon size={20} />
          </button>
          {mode === 'photo' ? (
            <button type="button" className={styles.shutter} onClick={snapPhoto} aria-label="Tirar foto">
              <span className={styles.shutterInner} />
            </button>
          ) : recording ? (
            <button type="button" className={[styles.shutter, styles.shutterRec].join(' ')} onClick={stopVideo} aria-label="Parar gravação">
              <span className={styles.stopSquare} />
            </button>
          ) : (
            <button type="button" className={styles.shutter} onClick={startVideo} aria-label="Iniciar gravação">
              <span className={[styles.shutterInner, styles.shutterDot].join(' ')} />
            </button>
          )}
          <span className={styles.flipBtn} aria-hidden style={{ visibility: 'hidden' }} />
        </div>
      ) : null}
    </Modal>
  );
}

function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}
