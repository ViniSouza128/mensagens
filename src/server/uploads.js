import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { paths, limits } from '@/config/env';
import { newId } from '@/lib/id';
import { HttpError } from '@/server/auth';
import { logger } from '@/server/logger';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg']);
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac', 'audio/x-m4a', 'audio/mp4']);

// Extensions that can be directly executed or installed on Windows/macOS/Linux/mobile.
// Blocked regardless of the MIME type reported by the client.
const BLOCKED_EXTS = new Set([
  'exe', 'com', 'scr', 'pif', 'bat', 'cmd', 'msi', 'msp', 'msc',
  'ps1', 'psm1', 'psd1', 'ps1xml',
  'vbs', 'vbe', 'wsh', 'wsc', 'wsf', 'hta',
  'lnk', 'reg', 'inf',
  'jar',
  'app', 'dmg', 'pkg', 'deb', 'rpm', 'apk', 'ipa',
]);

function ensureDirSync(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeExt(name, fallback = 'bin') {
  if (!name) return fallback;
  const m = String(name).match(/\.([a-z0-9]{1,8})$/i);
  if (!m) return fallback;
  return m[1].toLowerCase();
}

function classify({ mime, kindHint }) {
  if (kindHint === 'document') return 'document';
  if (mime === 'image/gif') return 'gif';
  if (IMAGE_TYPES.has(mime)) return 'image';
  if (VIDEO_TYPES.has(mime)) return 'video';
  if (AUDIO_TYPES.has(mime)) return 'audio';
  return 'document';
}

export async function saveUpload({ buffer, originalName, mime, size, hd = false, kindHint = null, rotate = 0 }) {
  const ext = safeExt(originalName);
  if (BLOCKED_EXTS.has(ext)) throw new HttpError(415, 'blocked_file_type');

  const kind = classify({ mime, kindHint });

  // validações de tipo
  if (kind === 'image' || kind === 'gif') {
    if (!IMAGE_TYPES.has(mime)) throw new HttpError(415, 'invalid_image_type');
    if (size > limits.photoBytes) throw new HttpError(413, 'photo_too_large');
  } else if (kind === 'video') {
    if (!VIDEO_TYPES.has(mime)) throw new HttpError(415, 'invalid_video_type');
    if (size > limits.videoBytes) throw new HttpError(413, 'video_too_large');
  } else if (kind === 'audio') {
    if (!AUDIO_TYPES.has(mime)) throw new HttpError(415, 'invalid_audio_type');
    if (size > limits.fileBytes) throw new HttpError(413, 'audio_too_large');
  } else {
    if (size > limits.fileBytes) throw new HttpError(413, 'file_too_large');
  }

  ensureDirSync(paths.uploadsOriginals);
  ensureDirSync(paths.uploadsThumbs);
  ensureDirSync(paths.uploadsPosters);

  const id = newId();
  const fileExt = safeExt(originalName, kind === 'image' ? 'jpg' : kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : 'bin');
  const baseName = `${id}.${fileExt}`;
  let storagePath = `originals/${baseName}`;
  let thumbPath = null;
  let posterPath = null;
  let width = null;
  let height = null;

  const originalAbs = path.join(paths.uploadsOriginals, baseName);

  if (kind === 'image') {
    // Reduz a foto enviada como foto (HD muda o lado máximo).
    const maxSide = hd ? limits.photoMaxSidePxHd : limits.photoMaxSidePx;
    try {
      // .rotate() sem argumento usa dados EXIF; depois aplica rotação manual do usuário (0/90/180/270)
      let pipeline = sharp(buffer, { failOn: 'none' }).rotate();
      if (rotate && rotate !== 0) pipeline = pipeline.rotate(rotate);
      const resized = await pipeline
        .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: hd ? 90 : 82, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      const finalName = `${id}.jpg`;
      storagePath = `originals/${finalName}`;
      const finalAbs = path.join(paths.uploadsOriginals, finalName);
      fs.writeFileSync(finalAbs, resized.data);
      width = resized.info.width;
      height = resized.info.height;

      // miniatura leve
      const thumbBuf = await sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize({ width: limits.thumbSidePx, height: limits.thumbSidePx, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 65, mozjpeg: true })
        .toBuffer();
      const thumbName = `${id}.jpg`;
      thumbPath = `thumbs/${thumbName}`;
      fs.writeFileSync(path.join(paths.uploadsThumbs, thumbName), thumbBuf);
    } catch (err) {
      logger.error('image processing failed', { stack: err?.stack, message: err?.message });
      throw new HttpError(415, 'image_processing_failed');
    }
  } else if (kind === 'gif') {
    // GIF animado: preserva original e gera miniatura estática.
    fs.writeFileSync(originalAbs, buffer);
    storagePath = `originals/${baseName}`;
    try {
      const thumbBuf = await sharp(buffer, { animated: false, failOn: 'none' })
        .resize({ width: limits.thumbSidePx, height: limits.thumbSidePx, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 65, mozjpeg: true })
        .toBuffer();
      const thumbName = `${id}.jpg`;
      thumbPath = `thumbs/${thumbName}`;
      fs.writeFileSync(path.join(paths.uploadsThumbs, thumbName), thumbBuf);
    } catch {
      // se falhar, segue sem thumb
    }
    try {
      const meta = await sharp(buffer, { failOn: 'none' }).metadata();
      width = meta.width || null;
      height = meta.height || null;
    } catch { /* noop */ }
  } else if (kind === 'video') {
    // Sem ffmpeg nesta versão: preserva o original.
    // Posterframe é deixado como null; cliente cai em placeholder.
    fs.writeFileSync(originalAbs, buffer);
  } else if (kind === 'audio') {
    fs.writeFileSync(originalAbs, buffer);
  } else {
    // documento genérico
    fs.writeFileSync(originalAbs, buffer);
  }

  return {
    id,
    kind,
    mime,
    filename: originalName || baseName,
    size,
    width,
    height,
    duration_ms: null,
    storage_path: storagePath,
    thumb_path: thumbPath,
    poster_path: posterPath,
    hd: kind === 'image' && hd ? 1 : 0,
  };
}

// Resolve um caminho relativo de upload de forma segura, prevenindo path traversal.
export function resolveUploadPath(rel) {
  const base = paths.uploadsDir;
  const abs = path.resolve(base, rel);
  if (!abs.startsWith(base + path.sep) && abs !== base) {
    return null;
  }
  return abs;
}
