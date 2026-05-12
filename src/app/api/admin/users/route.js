import { ok, withErrors, readBody } from '@/server/http';
import { requireAdmin } from '@/server/auth';
import { adminListUsers, adminSetAdmin, adminSuspend, adminBan, adminReinstate } from '@/server/handlers/users';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  return withErrors(async () => {
    await requireAdmin();
    const url = new URL(req.url);
    const q = url.searchParams.get('q') || null;
    const status = url.searchParams.get('status') || null;
    const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);
    const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0;
    return ok(adminListUsers({ q, status, limit, offset }));
  });
}

export async function POST(req) {
  return withErrors(async () => {
    const me = await requireAdmin();
    const { action, target_id, value, reason, until } = await readBody(req);
    if (action === 'set_admin') adminSetAdmin(me.id, target_id, !!value);
    else if (action === 'suspend') adminSuspend(me.id, target_id, until || null, reason || null);
    else if (action === 'ban') adminBan(me.id, target_id, reason || null);
    else if (action === 'reinstate') adminReinstate(me.id, target_id);
    else return ok({ ok: false, error: 'unknown_action' });
    return ok({ ok: true });
  });
}
