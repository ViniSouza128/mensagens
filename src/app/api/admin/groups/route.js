import { ok, withErrors, readBody } from '@/server/http';
import { requireAdmin } from '@/server/auth';
import { listGroups, moderateGroup } from '@/server/handlers/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  return withErrors(async () => {
    await requireAdmin();
    const url = new URL(req.url);
    const q = url.searchParams.get('q') || null;
    const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);
    const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0;
    return ok(listGroups({ q, limit, offset }));
  });
}

export async function POST(req) {
  return withErrors(async () => {
    const me = await requireAdmin();
    const { chat_id, action, reason } = await readBody(req);
    moderateGroup({ chatId: chat_id, adminId: me.id, action, reason: reason || null });
    return ok({ ok: true });
  });
}
