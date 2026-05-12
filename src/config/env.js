import path from 'node:path';

const root = process.cwd();

function envInt(name, fallback) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const paths = {
  root,
  dataDir: path.resolve(root, process.env.DATA_DIR || 'data'),
  uploadsDir: path.resolve(root, process.env.UPLOADS_DIR || 'uploads'),
  uploadsOriginals: path.resolve(root, process.env.UPLOADS_DIR || 'uploads', 'originals'),
  uploadsThumbs: path.resolve(root, process.env.UPLOADS_DIR || 'uploads', 'thumbs'),
  uploadsPosters: path.resolve(root, process.env.UPLOADS_DIR || 'uploads', 'posters'),
  logsDir: path.resolve(root, process.env.LOGS_DIR || 'logs'),
};

const DEFAULT_SECRET = 'dev-secret-change-me-please-change-this-in-prod';
export const auth = {
  secret: process.env.AUTH_SECRET || DEFAULT_SECRET,
  cookieName: 'mensagens_session',
  cookieDomain: process.env.AUTH_COOKIE_DOMAIN || undefined,
  ttlSeconds: envInt('AUTH_TTL_SECONDS', 60 * 60 * 24 * 30),
};

if (process.env.NODE_ENV === 'production' && auth.secret === DEFAULT_SECRET) {
  throw new Error(
    '[mensagens] AUTH_SECRET está com o valor padrão de desenvolvimento. ' +
    'Defina a variável de ambiente AUTH_SECRET com uma string aleatória e segura antes de iniciar em produção.'
  );
}

export const limits = {
  photoBytes: envInt('UPLOAD_MAX_PHOTO', 80 * 1024 * 1024),
  videoBytes: envInt('UPLOAD_MAX_VIDEO', 320 * 1024 * 1024),
  fileBytes: envInt('UPLOAD_MAX_FILE', 2 * 1024 * 1024 * 1024),
  // Reduções de imagens enviadas como foto:
  photoMaxSidePx: 1600,
  photoMaxSidePxHd: 2560,
  thumbSidePx: 220,
  // Rate limits
  msgPerMinute: 60,
  uploadsPerMinute: 30,
};

export const linkPreviewCfg = {
  timeoutMs: envInt('LINK_PREVIEW_TIMEOUT_MS', 5000),
  maxBytes: envInt('LINK_PREVIEW_MAX_BYTES', 512 * 1024),
};

export const adminSeed = {
  username: process.env.ADMIN_USERNAME || 'admin',
  email: process.env.ADMIN_EMAIL || 'admin@mensagens.local',
  password: process.env.ADMIN_PASSWORD || 'admin123',
  name: process.env.ADMIN_NAME || 'Administrador',
};
