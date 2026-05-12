import { ok, withErrors } from '@/server/http';
import { requireAdmin } from '@/server/auth';
import { listAuditLog } from '@/server/handlers/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  return withErrors(async () => {
    await requireAdmin();
    const url = new URL(req.url);
    const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500);
    const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0;
    const action = url.searchParams.get('action') || null;
    const actor = url.searchParams.get('actor') || null;
    return ok(listAuditLog({ limit, offset, action, actor }));
  });
}
