import { ok, fail, withErrors, readBody } from '@/server/http';
import { getDb, runSchema } from '@/database/db';
import { normalizeUsername } from '@/lib/normalize';
import { verifyPassword, createSession, setSessionCookie } from '@/server/auth';
import { audit } from '@/server/audit';
import { checkRate } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  return withErrors(async () => {
    runSchema();
    const ip = req.headers.get('x-forwarded-for') || 'local';
    const rl = checkRate(`login:${ip}`, { windowMs: 60_000, max: 20 });
    if (!rl.allowed) return fail(429, 'rate_limited');

    const { identifier, password } = await readBody(req);
    if (!identifier || !password) return fail(400, 'missing_credentials');

    const db = getDb();
    const id = String(identifier).trim();
    const user = db
      .prepare('SELECT * FROM users WHERE username_normalized = ? OR email = ?')
      .get(normalizeUsername(id), id.toLowerCase());
    if (!user) return fail(401, 'invalid_credentials');
    if (user.status === 'banned') return fail(403, 'banned');
    if (user.status === 'suspended' && user.status_until && user.status_until > Date.now()) {
      return fail(403, 'suspended', { until: user.status_until });
    }
    const okPwd = await verifyPassword(password, user.password_hash);
    if (!okPwd) return fail(401, 'invalid_credentials');

    const ua = req.headers.get('user-agent') || null;
    const { token } = await createSession(user.id, { userAgent: ua, ip });
    await setSessionCookie(token);
    audit({ actorId: user.id, action: 'auth.login', metadata: { ip } });
    return ok({ id: user.id, username: user.username, name: user.name, is_admin: !!user.is_admin });
  });
}
