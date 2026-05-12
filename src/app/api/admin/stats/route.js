import { ok, withErrors } from '@/server/http';
import { requireAdmin } from '@/server/auth';
import { dashboardStats } from '@/server/handlers/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return withErrors(async () => {
    await requireAdmin();
    return ok(dashboardStats());
  });
}
