import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { auth as authCfg } from '@/config/env';
import { getDb } from '@/database/db';
import { newId } from '@/lib/id';
import { normalize } from '@/lib/normalize';

const encoder = new TextEncoder();
const SECRET = encoder.encode(authCfg.secret);

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export async function signSession({ uid, sid }) {
  const ttl = authCfg.ttlSeconds;
  return new SignJWT({ uid, sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(SECRET);
}

export async function verifySession(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(userId, { userAgent = null, ip = null } = {}) {
  const db = getDb();
  const sid = newId();
  const now = Date.now();
  const expires = now + authCfg.ttlSeconds * 1000;
  db.prepare(
    `INSERT INTO sessions (id, user_id, user_agent, ip, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(sid, userId, userAgent, ip, now, now, expires);
  // Probabilistic GC: clean up expired sessions ~1% of the time to avoid unbounded table growth
  if (Math.random() < 0.01) {
    try { db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now); } catch { /* noop */ }
  }
  const token = await signSession({ uid: userId, sid });
  return { sid, token, expires };
}

export function destroySession(sid) {
  if (!sid) return;
  try {
    getDb().prepare('DELETE FROM sessions WHERE id = ?').run(sid);
  } catch {
    /* noop */
  }
}

export async function setSessionCookie(token) {
  (await cookies()).set(authCfg.cookieName, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    domain: authCfg.cookieDomain,
    path: '/',
    maxAge: authCfg.ttlSeconds,
  });
}

export async function clearSessionCookie() {
  (await cookies()).set(authCfg.cookieName, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    domain: authCfg.cookieDomain,
    path: '/',
    maxAge: 0,
  });
}

export async function getCurrentUser() {
  const c = (await cookies()).get(authCfg.cookieName);
  if (!c?.value) return null;
  const payload = await verifySession(c.value);
  if (!payload?.uid || !payload?.sid) return null;
  const db = getDb();
  const sess = db.prepare('SELECT * FROM sessions WHERE id = ?').get(payload.sid);
  if (!sess || sess.user_id !== payload.uid) return null;
  if (sess.expires_at < Date.now()) {
    destroySession(payload.sid);
    return null;
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
  if (!user) return null;
  if (user.status === 'banned') return null;
  if (user.status === 'suspended' && user.status_until && user.status_until > Date.now()) return null;
  // toca last_seen
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(Date.now(), payload.sid);
  db.prepare('UPDATE users SET last_seen_at = ?, online = 1 WHERE id = ?').run(Date.now(), user.id);
  return { ...user, sid: payload.sid };
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) throw new HttpError(401, 'unauthorized');
  return u;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (!u.is_admin) throw new HttpError(403, 'forbidden');
  return u;
}

export class HttpError extends Error {
  constructor(status, code, info) {
    super(code);
    this.status = status;
    this.code = code;
    this.info = info;
  }
}

export { normalize };
