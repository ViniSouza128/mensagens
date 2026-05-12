import { ok, withErrors, readBody } from '@/server/http';
import { requireAdmin } from '@/server/auth';
import { listReports, getReportContext, resolveReport } from '@/server/handlers/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  return withErrors(async () => {
    const me = await requireAdmin();
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (id) return ok(getReportContext(id, me.id));

    const status = url.searchParams.get('status') || null;
    const target_type = url.searchParams.get('target_type') || null;
    const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);
    const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0;
    return ok(listReports({ status, target_type, limit, offset }));
  });
}

export async function PATCH(req) {
  return withErrors(async () => {
    const me = await requireAdmin();
    const { id, decision } = await readBody(req);
    resolveReport({ reportId: id, adminId: me.id, decision });
    return ok({});
  });
}
