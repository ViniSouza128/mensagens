import { ok, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { searchUsers } from '@/server/handlers/users';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const url = new URL(req.url);
    const q = url.searchParams.get('q') || '';
    const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '20', 10) || 20, 50);
    return ok(searchUsers(q, u.id, { limit }));
  });
}
