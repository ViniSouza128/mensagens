import { ok, withErrors, readBody } from '@/server/http';
import { requireUser } from '@/server/auth';
import { createReport } from '@/server/handlers/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const { target_type, target_id, reason, details } = await readBody(req);
    return ok(createReport({ reporterId: u.id, target_type, target_id, reason, details }));
  });
}
