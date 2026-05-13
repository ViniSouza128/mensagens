import { getCurrentUser, HttpError } from '@/server/auth';

const WINDOW_MS = 60_000;
const MAX_SPY_CALLS = 120;
const spyBuckets = new Map();

function isSpyRequest(req) {
  try {
    return new URL(req.url).pathname.startsWith('/api/admin/spy/');
  } catch {
    return false;
  }
}

function checkSpyRateLimit(adminId) {
  const now = Date.now();
  const since = now - WINDOW_MS;
  const bucket = (spyBuckets.get(adminId) || []).filter((ts) => ts > since);
  if (bucket.length >= MAX_SPY_CALLS) {
    spyBuckets.set(adminId, bucket);
    throw new HttpError(429, 'rate_limited');
  }
  bucket.push(now);
  spyBuckets.set(adminId, bucket);
}

export async function requireAdmin(req) {
  const user = await getCurrentUser();
  if (!user || !user.is_admin) throw new HttpError(403, 'forbidden');
  // O painel spy e intencionalmente sensivel; o limite simples em memoria
  // evita varreduras acidentais sem adicionar dependencia nem estado global.
  if (req && isSpyRequest(req)) checkSpyRateLimit(user.id);
  return user;
}
