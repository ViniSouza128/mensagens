import { getDb } from '@/database/db';
import { HttpError } from '@/server/auth';
import { normalize, normalizeUsername } from '@/lib/normalize';
import { audit } from '@/server/audit';

const PUBLIC_FIELDS = [
  'id', 'username', 'name', 'bio', 'avatar_path', 'last_seen_at', 'online',
  'privacy_last_seen', 'privacy_avatar', 'privacy_bio',
  'is_admin', 'status', 'created_at',
  // Campos de bot LLM — front-end usa para badge "AI" e tooltip com o modelo.
  'is_bot', 'bot_model', 'bot_tagline', 'bot_vision',
];

const SETTINGS_FIELDS = [
  'name', 'bio', 'avatar_path', 'username',
  'privacy_last_seen', 'privacy_avatar', 'privacy_bio',
  'read_receipts', 'block_unknown',
  'notify_messages', 'notify_groups', 'sound_enabled', 'send_with_enter',
  'theme', 'accent', 'font_size', 'media_quality', 'auto_download', 'wallpaper',
];

const PRIVACY_VALUES = new Set(['everyone', 'contacts', 'nobody']);
const THEMES = new Set(['auto', 'light', 'dark']);
const FONT_SIZES = new Set(['small', 'normal', 'large']);
const MEDIA_QUALITIES = new Set(['optimized', 'hd']);
const AUTO_DOWNLOAD = new Set(['always', 'wifi', 'never']);

export function publicUser(row, viewerId = null) {
  if (!row) return null;
  const out = {};
  for (const f of PUBLIC_FIELDS) out[f] = row[f];
  // privacidade simplificada (visualização sem checagem de "contato"):
  if (viewerId !== row.id) {
    if (row.privacy_last_seen !== 'everyone') out.last_seen_at = null;
    if (row.privacy_bio !== 'everyone') out.bio = '';
  }
  return out;
}

export function getUserByUsername(username) {
  return getDb().prepare('SELECT * FROM users WHERE username_normalized = ?').get(normalizeUsername(username));
}

export function getUserById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function updateProfile(userId, patch) {
  const db = getDb();
  const allowed = {};
  for (const k of Object.keys(patch || {})) {
    if (SETTINGS_FIELDS.includes(k)) allowed[k] = patch[k];
  }
  // validações
  if ('privacy_last_seen' in allowed && !PRIVACY_VALUES.has(allowed.privacy_last_seen)) throw new HttpError(400, 'invalid_privacy_last_seen');
  if ('privacy_avatar' in allowed && !PRIVACY_VALUES.has(allowed.privacy_avatar)) throw new HttpError(400, 'invalid_privacy_avatar');
  if ('privacy_bio' in allowed && !PRIVACY_VALUES.has(allowed.privacy_bio)) throw new HttpError(400, 'invalid_privacy_bio');
  if ('theme' in allowed && !THEMES.has(allowed.theme)) throw new HttpError(400, 'invalid_theme');
  if ('font_size' in allowed && !FONT_SIZES.has(allowed.font_size)) throw new HttpError(400, 'invalid_font_size');
  if ('media_quality' in allowed && !MEDIA_QUALITIES.has(allowed.media_quality)) throw new HttpError(400, 'invalid_media_quality');
  if ('auto_download' in allowed && !AUTO_DOWNLOAD.has(allowed.auto_download)) throw new HttpError(400, 'invalid_auto_download');
  if ('name' in allowed) {
    if (typeof allowed.name !== 'string' || allowed.name.trim().length < 1) throw new HttpError(400, 'invalid_name');
    allowed.name = allowed.name.trim().slice(0, 80);
  }
  if ('bio' in allowed && typeof allowed.bio === 'string') {
    allowed.bio = allowed.bio.slice(0, 280);
  }
  if ('username' in allowed) {
    const u = String(allowed.username || '').trim();
    if (!/^[a-zA-Z0-9_.]{3,30}$/.test(u)) throw new HttpError(400, 'invalid_username');
    const normalized = normalizeUsername(u);
    const existing = db.prepare('SELECT id FROM users WHERE username_normalized = ? AND id != ?').get(normalized, userId);
    if (existing) throw new HttpError(409, 'username_taken');
    allowed.username = u.toLowerCase();
    allowed.username_normalized = normalized;
  }

  const fields = Object.keys(allowed);
  if (fields.length === 0) return getUserById(userId);

  const sets = fields.map((f) => `${f} = ?`).join(', ');
  const values = fields.map((f) => {
    const v = allowed[f];
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  });
  values.push(Date.now(), userId);
  db.prepare(`UPDATE users SET ${sets}, updated_at = ? WHERE id = ?`).run(...values);
  audit({ actorId: userId, action: 'user.update', targetType: 'user', targetId: userId, metadata: { fields } });
  return getUserById(userId);
}

export function setOnboarded(userId, value = true) {
  getDb().prepare('UPDATE users SET onboarded = ?, updated_at = ? WHERE id = ?').run(value ? 1 : 0, Date.now(), userId);
}

export function searchUsers(term, viewerId, { limit = 20 } = {}) {
  const norm = normalize(term);
  if (!norm) return [];
  const db = getDb();
  // Tenta exata por username e id
  const exact = [];
  const byU = db.prepare('SELECT * FROM users WHERE username_normalized = ? LIMIT 1').get(norm);
  if (byU) exact.push(byU);
  const byId = /^[a-z0-9]{6,}$/i.test(term) ? db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(term) : null;
  if (byId && !exact.find((e) => e.id === byId.id)) exact.push(byId);
  // Fuzzy por LIKE em normalized
  const like = `%${norm.replace(/[%_]/g, (m) => '\\' + m)}%`;
  const fuzzy = db
    .prepare(
      `SELECT * FROM users
       WHERE (username_normalized LIKE ? ESCAPE '\\' OR LOWER(name) LIKE ? ESCAPE '\\')
         AND id != ? AND status = 'active'
       ORDER BY name COLLATE NOCASE LIMIT ?`
    )
    .all(like, like, viewerId || '', limit);
  const seen = new Set();
  const merged = [];
  for (const u of [...exact, ...fuzzy]) {
    if (!u || seen.has(u.id)) continue;
    if (u.id === viewerId) continue;
    seen.add(u.id);
    merged.push(publicUser(u, viewerId));
    if (merged.length >= limit) break;
  }
  return merged;
}

// =====================
// ADMIN
// =====================
export function adminListUsers({ q = null, status = null, limit = 50, offset = 0 }) {
  const db = getDb();
  const params = [];
  let where = 'WHERE 1=1';
  if (q) {
    const norm = normalize(q);
    where += ' AND (username_normalized LIKE ? OR LOWER(name) LIKE ? OR id = ?)';
    params.push(`%${norm}%`, `%${norm}%`, q);
  }
  if (status) {
    where += ' AND status = ?';
    params.push(status);
  }
  const rows = db
    .prepare(`SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  return rows.map((r) => publicUser(r));
}

export function adminSetAdmin(actorId, targetId, isAdmin) {
  getDb().prepare('UPDATE users SET is_admin = ?, updated_at = ? WHERE id = ?').run(isAdmin ? 1 : 0, Date.now(), targetId);
  audit({ actorId, action: 'admin.grant', targetType: 'user', targetId, metadata: { is_admin: !!isAdmin } });
}

export function adminSuspend(actorId, targetId, untilMs, reason) {
  getDb().prepare(`UPDATE users SET status='suspended', status_until=?, updated_at=? WHERE id=?`)
    .run(untilMs || null, Date.now(), targetId);
  audit({ actorId, action: 'admin.suspend', targetType: 'user', targetId, metadata: { untilMs, reason } });
}

export function adminBan(actorId, targetId, reason) {
  getDb().prepare(`UPDATE users SET status='banned', status_until=NULL, updated_at=? WHERE id=?`)
    .run(Date.now(), targetId);
  audit({ actorId, action: 'admin.ban', targetType: 'user', targetId, metadata: { reason } });
}

export function adminReinstate(actorId, targetId) {
  getDb().prepare(`UPDATE users SET status='active', status_until=NULL, updated_at=? WHERE id=?`)
    .run(Date.now(), targetId);
  audit({ actorId, action: 'admin.reinstate', targetType: 'user', targetId });
}
