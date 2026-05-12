import { ok, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { listChatsForUser } from '@/server/handlers/chats';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const url = new URL(req.url);
    const archived = url.searchParams.get('archived') === '1';
    return ok(listChatsForUser(u.id, { archived }));
  });
}
