'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { firstUrl } from '@/lib/url';
import IconButton from '@/components/ui/IconButton';
import LinkPreview from './LinkPreview';
import ReplyPreview from './ReplyPreview';
import {
  SendIcon, PaperclipIcon, SmileIcon, XIcon, MicIcon, TrashIcon,
} from '@/components/icons/Icons';
import AttachMenu from './AttachMenu';
import dynamic from 'next/dynamic';
// Câmera traz MediaRecorder + canvas; só baixa quando o usuário clica em câmera.
const CameraCapture = dynamic(() => import('./CameraCapture'), { ssr: false });
import styles from './Composer.module.css';

const QUICK_EMOJI = ['😃', '😂', '👍', '❤️', '🙏', '🔥', '🎉', '😍'];

const EMOJI_CATEGORIES = [
  { label: 'Recentes', key: 'recent', emojis: [] },
  { label: 'Sorrisos', key: 'smileys', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😗','😋','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡'] },
  { label: 'Gestos', key: 'gestures', emojis: ['👍','👎','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👋','🤚','🖐️','✋','🖖','👏','🙌','👐','🤲','🙏','🤝'] },
  { label: 'Coração', key: 'love', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟'] },
  { label: 'Animais', key: 'animals', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🦄','🐔','🐧','🐦','🦅','🐺','🐗','🦋','🐝','🐞','🐢','🐍','🐙','🦑','🦞','🐠','🐟','🐬','🐳','🦈','🐊'] },
  { label: 'Comida', key: 'food', emojis: ['🍎','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥖','🍞','🥨','🧀','🍔','🍟','🍕','🌭','🍿','🥗','🍣','🍱','🍰','🧁','🍦','🍩','🍪','🍫','🍬'] },
  { label: 'Objetos', key: 'objects', emojis: ['💡','🔦','🕯️','📱','💻','⌨️','🖥️','🖨️','📷','🎥','📞','📺','📻','⏰','⌚','📚','✏️','📝','📌','📎','🔑','🔒','🔓','🔨','🛠️','💰','💎','⚙️','🧪','🔬','🔭'] },
  { label: 'Símbolos', key: 'symbols', emojis: ['✅','❌','⭕','❗','❓','‼️','⁉️','💯','💢','💥','💫','💦','💨','✨','⚡','🔥','🌟','⭐','🎉','🎊','🎁','🏆','🥇','🥈','🥉'] },
];

function draftKey(chatId) { return `mensagens.draft.${chatId}`; }

export default function Composer({ chat, me, reply, onCancelReply, onSend, onPreview, locked = false, lockedLabel = null }) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  // Voz — gravação real via MediaRecorder
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [waveLevels, setWaveLevels] = useState([]); // amplitudes 0..1 publicadas a cada ~60ms
  const recordTimer = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const waveBufferRef = useRef([]);   // buffer ref atualizado em tempo real (sem state)
  const waveMaxRef = useRef(0.05);    // pico observado p/ auto-gain
  const lastPushRef = useRef(0);

  const fileRef = useRef(null);
  const imgRef = useRef(null);
  const taRef = useRef(null);

  // carrega draft
  useEffect(() => {
    try {
      const v = localStorage.getItem(draftKey(chat.id));
      setText(v || '');
    } catch { setText(''); }
  }, [chat.id]);

  // salva draft (debounced + idle — não bloqueia digitação rápida)
  const draftTimer = useRef(null);
  useEffect(() => {
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      const ric = (typeof window !== 'undefined' && window.requestIdleCallback)
        ? window.requestIdleCallback : (cb) => setTimeout(cb, 50);
      ric(() => {
        try {
          if (text) localStorage.setItem(draftKey(chat.id), text);
          else localStorage.removeItem(draftKey(chat.id));
        } catch {}
      });
    }, 350);
    return () => clearTimeout(draftTimer.current);
  }, [text, chat.id]);

  const linkUrl = useMemo(() => {
    const u = firstUrl(text);
    return u?.href || null;
  }, [text]);

  // textarea autosize — em rAF para evitar layout síncrono em digitação rápida
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    const id = requestAnimationFrame(() => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(Math.max(ta.scrollHeight, 48), 220) + 'px';
    });
    return () => cancelAnimationFrame(id);
  }, [text]);

  // Permite que outros componentes (ex: EmptyChat) preencham o composer
  useEffect(() => {
    function onPrefill(e) {
      const v = e.detail;
      if (typeof v !== 'string') return;
      setText((t) => t ? t + ' ' + v : v);
      setTimeout(() => taRef.current?.focus(), 0);
    }
    window.addEventListener('mensagens:composer.prefill', onPrefill);
    return () => window.removeEventListener('mensagens:composer.prefill', onPrefill);
  }, []);

  // Limpa recursos de áudio ao desmontar
  useEffect(() => () => cleanupAudio(), []);

  function cleanupAudio() {
    if (recordTimer.current) { clearInterval(recordTimer.current); recordTimer.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    analyserRef.current = null;
    audioChunksRef.current = [];
  }

  function submit() {
    // Lock ativo (ex.: bot LLM mid-resposta multi-balão): NÃO enfileira nem
    // envia — apenas ignora. O usuário vê o aviso visual `lockedLabel` e
    // continua livre pra editar o texto. Decisão: NÃO mandar quando bot
    // termina, porque a resposta dele pode mudar o que o humano quer falar.
    if (locked) return;
    const body = text.trim();
    if (!body) return;
    onSend({ body, attachments: [] });
    setText('');
    try { localStorage.removeItem(draftKey(chat.id)); } catch {}
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = rec;
      audioChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data); };
      rec.start(250);

      // Visualizador de waveform em tempo real.
      // Estratégia: amostragem a cada 50ms (não a cada frame) — sincroniza
      // melhor com a fala, evita re-render a 60fps. Auto-gain via pico
      // observado deixa as barras sempre proporcionais à voz do usuário.
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024; // janela maior = RMS mais estável
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.fftSize);

      waveBufferRef.current = [];
      waveMaxRef.current = 0.05;
      lastPushRef.current = performance.now();
      setWaveLevels([]);

      const SAMPLE_INTERVAL_MS = 50; // 20 amostras/seg — sincronia natural com fala
      const MAX_BARS = 50;

      const tick = (now) => {
        if (!analyserRef.current) return;
        analyser.getByteTimeDomainData(data);
        // RMS no intervalo desde a última amostra
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        // Auto-gain: aprende o pico de voz do usuário (decai lentamente)
        if (rms > waveMaxRef.current) waveMaxRef.current = rms;
        else waveMaxRef.current = Math.max(0.04, waveMaxRef.current * 0.9995);
        const level = Math.min(1, (rms / waveMaxRef.current) * 0.92);

        if (now - lastPushRef.current >= SAMPLE_INTERVAL_MS) {
          lastPushRef.current = now;
          waveBufferRef.current.push(level);
          if (waveBufferRef.current.length > MAX_BARS) {
            waveBufferRef.current = waveBufferRef.current.slice(-MAX_BARS);
          }
          // Publica o array referencialmente novo p/ disparar re-render
          setWaveLevels(waveBufferRef.current.slice());
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      setRecording(true);
      setRecordSec(0);
      recordTimer.current = setInterval(() => setRecordSec((s) => s + 1), 1000);
    } catch (e) {
      alert('Não foi possível acessar o microfone: ' + (e?.message || e));
      cleanupAudio();
    }
  }

  function stopRecording(send) {
    const rec = mediaRecorderRef.current;
    if (!rec) { setRecording(false); return; }

    const seconds = recordSec;
    // Lê do REF (não do state) p/ pegar a forma mais atualizada
    const wave = [...waveBufferRef.current];

    rec.onstop = async () => {
      if (send && audioChunksRef.current.length > 0 && seconds > 0) {
        const blob = new Blob(audioChunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: blob.type });
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        const duration = `${m}:${s < 10 ? '0' : ''}${s}`;
        // amostra simplificada de wave (16 barras) p/ player
        const sampled = sampleWave(wave, 16);
        // Envia como anexo de áudio com flag voice; o handler de upload cuida do storage
        onSend({
          body: null,
          type: 'voice',
          voice: { duration, wave: sampled },
          attachments: [{
            kind: 'audio',
            mime: blob.type,
            file,
            duration_ms: seconds * 1000,
          }],
        });
      }
      cleanupAudio();
      setRecording(false);
      setRecordSec(0);
      setWaveLevels([]);
    };

    try { rec.stop(); } catch { cleanupAudio(); setRecording(false); }
  }

  function onAttachPick(kind) {
    if (kind === 'image') imgRef.current?.click();
    else if (kind === 'file') fileRef.current?.click();
    else if (kind === 'camera') setShowCamera(true);
    else if (kind === 'poll') window.dispatchEvent(new CustomEvent('mensagens:openPoll'));
    else if (kind === 'gif') window.dispatchEvent(new CustomEvent('mensagens:openGif'));
    else if (kind === 'sticker') window.dispatchEvent(new CustomEvent('mensagens:openSticker'));
  }

  function onCameraCapture(file, kind) {
    const item = {
      kind,
      file,
      src: URL.createObjectURL(file),
      name: file.name,
    };
    onPreview?.([item]);
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && me?.send_with_enter) {
      e.preventDefault();
      submit();
    }
  }

  function handleFiles(files) {
    const list = [...files];
    const items = list.map((f) => {
      const isImage = /^image\//.test(f.type) && f.type !== 'image/gif';
      const isGif = f.type === 'image/gif';
      const isVideo = /^video\//.test(f.type);
      const isAudio = /^audio\//.test(f.type);
      const kind = isImage ? 'image' : isGif ? 'gif' : isVideo ? 'video' : isAudio ? 'audio' : 'file';
      return { kind, file: f, src: URL.createObjectURL(f), name: f.name };
    });
    onPreview?.(items);
  }

  function onPaste(e) {
    const items = [...(e.clipboardData?.items || [])];
    const fileItems = items.filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter(Boolean);
    if (fileItems.length > 0) {
      e.preventDefault();
      handleFiles(fileItems);
    }
  }

  function insertEmoji(em) {
    const ta = taRef.current;
    if (!ta) { setText((t) => t + em); return; }
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    const next = text.slice(0, start) + em + text.slice(end);
    setText(next);
    setTimeout(() => {
      ta.focus();
      const pos = start + em.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  }

  return (
    <div className={styles.wrap}>
      {linkUrl ? <div className={styles.linkPreview}><LinkPreview url={linkUrl} compact /></div> : null}

      {reply ? (
        <div className={styles.contextRow}>
          <ReplyPreview reply={reply} dim />
          <button type="button" className={styles.closeBtn} onClick={onCancelReply} aria-label="Cancelar resposta"><XIcon size={14} /></button>
        </div>
      ) : null}

      {recording ? (
        <div className={styles.recording}>
          <span className={styles.recordPulse} aria-hidden />
          <span className={styles.recordTime}>{formatRecordTime(recordSec)}</span>
          <div className={styles.liveWave} aria-hidden>
            {waveLevels.slice(-50).map((l, i) => (
              <span key={i} className={styles.liveBar} style={{ height: `${Math.max(8, l * 100)}%` }} />
            ))}
          </div>
          <IconButton label="Cancelar" onClick={() => stopRecording(false)}><TrashIcon size={16} /></IconButton>
          <button
            type="button"
            className={styles.sendBtn}
            onClick={() => stopRecording(true)}
            aria-label="Enviar gravação"
          >
            <SendIcon size={18} />
          </button>
        </div>
      ) : (
        <>
          {/* Banner explicando o lock — aparece logo acima da barra quando
              o partner é um bot LLM e está gerando resposta. NÃO enfileira
              o envio: o usuário pode mudar de ideia depois do que o bot
              respondeu, então preferimos exigir clique ativo de novo. */}
          {locked && lockedLabel ? (
            <div className={styles.lockBanner} role="status" aria-live="polite">
              <span className={styles.lockDot} aria-hidden />
              {lockedLabel}
            </div>
          ) : null}
          <div className={[styles.bar, locked ? styles.barLocked : ''].join(' ')}>
            {/* Esquerda: anexar + emoji (lado a lado) */}
            <div className={styles.left} style={{ position: 'relative' }}>
              <IconButton label="Anexar" onClick={() => setShowAttach((s) => !s)} disabled={locked}><PaperclipIcon /></IconButton>
              <div className={styles.emojiArea}>
                <IconButton label="Emoji" onClick={() => setShowEmoji((s) => !s)} disabled={locked}><SmileIcon /></IconButton>
                {showEmoji && !locked ? (
                  <EmojiPanel
                    onPick={(e) => insertEmoji(e)}
                    onClose={() => setShowEmoji(false)}
                  />
                ) : null}
              </div>
              <AttachMenu open={showAttach && !locked} onClose={() => setShowAttach(false)} onPick={onAttachPick} />
              <input ref={fileRef} type="file" hidden multiple onChange={(e) => handleFiles(e.target.files)} />
              <input ref={imgRef} type="file" hidden multiple accept="image/*,video/*" onChange={(e) => handleFiles(e.target.files)} />
            </div>

            {/* Centro: textarea. Mantemos editável quando locked pra usuário
                poder ajustar o texto ENQUANTO o bot responde; o envio é que
                fica bloqueado. */}
            <div className={styles.center}>
              <textarea
                ref={taRef}
                className={styles.input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKey}
                onPaste={onPaste}
                placeholder={locked ? 'Aguarde o bot terminar para enviar…' : 'Mensagem'}
                rows={1}
                aria-label="Mensagem"
              />
            </div>

            {/* Direita: enviar OU mic. Quando locked, fica visualmente desativado. */}
            <div className={styles.right}>
              {text.trim() ? (
                <button
                  type="button"
                  className={styles.sendBtn}
                  onClick={submit}
                  aria-label={locked ? 'Aguarde o bot terminar' : 'Enviar mensagem'}
                  title={locked ? 'Aguarde o bot terminar' : 'Enviar'}
                  disabled={locked}
                >
                  <SendIcon size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.micBtn}
                  onClick={startRecording}
                  aria-label="Gravar mensagem de voz"
                  title="Gravar áudio"
                  disabled={locked}
                >
                  <MicIcon size={18} />
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {showCamera ? (
        <CameraCapture open onClose={() => setShowCamera(false)} onCapture={onCameraCapture} />
      ) : null}
    </div>
  );
}

function sampleWave(arr, n) {
  if (!arr || arr.length === 0) return Array.from({ length: n }, () => 0.2);
  const out = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * step);
    const end = Math.min(arr.length, Math.floor((i + 1) * step));
    let max = 0;
    for (let j = start; j < end; j++) max = Math.max(max, arr[j] || 0);
    out.push(Math.max(0.08, max));
  }
  return out;
}

function formatRecordTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function EmojiPanel({ onPick, onClose }) {
  const [cat, setCat] = useState('smileys');
  const [recent, setRecent] = useState([]);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem('mensagens.emoji.recent') || '[]');
      if (Array.isArray(r)) setRecent(r);
    } catch {}
  }, []);

  useEffect(() => {
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) onClose?.(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  function pick(em) {
    onPick?.(em);
    const next = [em, ...recent.filter((e) => e !== em)].slice(0, 24);
    setRecent(next);
    try { localStorage.setItem('mensagens.emoji.recent', JSON.stringify(next)); } catch {}
  }

  const cats = EMOJI_CATEGORIES.map((c) => c.key === 'recent' ? { ...c, emojis: recent } : c);
  const active = cats.find((c) => c.key === cat) || cats[1];
  const list = q
    ? cats.flatMap((c) => c.emojis).filter((e) => e.includes(q))
    : active.emojis;

  return (
    <div className={styles.emojiPopup} ref={ref} role="menu">
      <div className={styles.emojiTabs}>
        {cats.map((c) => (
          <button
            key={c.key}
            type="button"
            className={[styles.emojiTab, cat === c.key ? styles.emojiTabActive : ''].join(' ')}
            onClick={() => { setCat(c.key); setQ(''); }}
            disabled={c.key === 'recent' && recent.length === 0}
            title={c.label}
            aria-label={c.label}
          >
            {c.key === 'recent' ? '🕘' : c.emojis[0] || '·'}
          </button>
        ))}
      </div>
      <div className={styles.emojiSearch}>
        <input
          className={styles.emojiSearchInput}
          placeholder="Buscar emoji"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className={styles.emojiGrid}>
        {list.length === 0
          ? <div className={styles.emojiEmpty}>Nenhum emoji</div>
          : list.map((e, i) => (
            <button key={`${e}-${i}`} type="button" className={styles.emojiBtn} onClick={() => pick(e)}>{e}</button>
          ))}
      </div>
      <div className={styles.emojiQuick}>
        {QUICK_EMOJI.map((e) => (
          <button key={`q-${e}`} type="button" className={styles.emojiQuickBtn} onClick={() => pick(e)}>{e}</button>
        ))}
      </div>
    </div>
  );
}
