import { ok, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { ensureMember } from '@/server/handlers/chats';
import { getDb } from '@/database/db';
import { decryptMessageRow } from '@/server/crypto/messageCrypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const URL_RE = /https?:\/\/[^\s<>"']+/g;

export async function GET(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    ensureMember(params.id, u.id);

    const url = new URL(req.url);
    const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '20', 10), 60);
    const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10);

    const db = getDb();
    const rows = db.prepare(
      `SELECT m.id, m.body, m.created_at, m.sender_id, u.name AS sender_name
       FROM messages m
       JOIN messages_fts f ON f.rowid = m.rowid
       JOIN users u ON u.id = m.sender_id
       WHERE m.chat_id = ? AND m.deleted = 0 AND f.body LIKE '%http%'
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`
    ).all(params.id, limit + 1, offset);

    const items = rows.slice(0, limit)
      .map((r) => decryptMessageRow(r))
      .map((r) => ({
        ...r,
        urls: [...new Set((r.body?.match(URL_RE) || []))],
      }))
      .filter((r) => r.urls.length > 0);

    return ok({ items, hasMore: rows.length > limit, offset });
  });
}
