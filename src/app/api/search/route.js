import { ok, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { globalSearch, searchInChat } from '@/server/search';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const url = new URL(req.url);
    const q = url.searchParams.get('q') || '';
    const chatId = url.searchParams.get('chat_id');
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10) || 10));

    if (chatId) return ok(searchInChat(chatId, u.id, q, { limit, offset }));
    return ok(globalSearch(u.id, q, { limitPerKind: limit, offset }));
  });
}
