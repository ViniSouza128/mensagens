import { ok, fail, withErrors, readBody } from '@/server/http';
import { getDb } from '@/database/db';
import { runSchema } from '@/database/db';
import { newId } from '@/lib/id';
import { normalize, normalizeUsername } from '@/lib/normalize';
import { hashPassword, createSession, setSessionCookie } from '@/server/auth';
import { validateEmail, validateName, validatePassword, validateUsername } from '@/server/validations';
import { audit } from '@/server/audit';
import { checkRate } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  return withErrors(async () => {
    runSchema(); // garante schema na primeira chamada
    const ip = req.headers.get('x-forwarded-for') || 'local';
    const rl = checkRate(`register:${ip}`, { windowMs: 60_000, max: 10 });
    if (!rl.allowed) return fail(429, 'rate_limited');

    const { username, email, password, name } = await readBody(req);
    validateUsername(username);
    validateEmail(email);
    validatePassword(password);
    validateName(name);

    const db = getDb();
    const exists = db.prepare('SELECT 1 FROM users WHERE username_normalized = ? OR email = ?')
      .get(normalizeUsername(username), email.toLowerCase());
    if (exists) return fail(409, 'user_exists');

    const id = newId();
    const now = Date.now();
    const hash = await hashPassword(password);
    db.prepare(
      `INSERT INTO users (
        id, username, username_normalized, email, password_hash, name,
        is_admin, status, onboarded, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 'active', 0, ?, ?)`
    ).run(id, username, normalizeUsername(username), email.toLowerCase(), hash, name.trim(), now, now);

    const ua = req.headers.get('user-agent') || null;
    const { token } = await createSession(id, { userAgent: ua, ip });
    await setSessionCookie(token);
    audit({ actorId: id, action: 'auth.register', metadata: { ip } });
    return ok({ id, username, name });
  });
}
