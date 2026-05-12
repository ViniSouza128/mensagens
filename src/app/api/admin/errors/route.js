import { ok, withErrors } from '@/server/http';
import { requireAdmin } from '@/server/auth';
import { listErrorLog } from '@/server/handlers/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  return withErrors(async () => {
    await requireAdmin();
    const url = new URL(req.url);
    const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500);
    const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0;
    const level = url.searchParams.get('level') || null;
    const q = url.searchParams.get('q') || null;
    return ok(listErrorLog({ limit, offset, level, q }));
  });
}
