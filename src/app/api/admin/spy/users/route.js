import { ok, withErrors } from '@/server/http';
import { requireAdmin } from '@/server/auth/requireAdmin';
import { auditSpyRequest, listSpyUsers } from '@/server/handlers/adminSpy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  return withErrors(async () => {
    const admin = await requireAdmin(req);
    auditSpyRequest({ req, adminId: admin.id, action: 'admin.spy.users', targetType: 'user' });
    const url = new URL(req.url);
    const q = url.searchParams.get('q') || null;
    const includeBots = url.searchParams.get('include_bots') === '1';
    const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 100);
    const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0;
    return ok(listSpyUsers({ q, includeBots, limit, offset }));
  });
}
