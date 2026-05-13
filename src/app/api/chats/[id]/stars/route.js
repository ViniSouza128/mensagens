import { ok, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { ensureMember } from '@/server/handlers/chats';
import { getDb } from '@/database/db';
import { decryptMessageRow } from '@/server/crypto/messageCrypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
      `SELECT m.id, m.body, m.type, m.created_at, m.sender_id,
              u.name AS sender_name, u.avatar_path AS sender_avatar,
              ms.created_at AS starred_at
       FROM message_stars ms
       JOIN messages m ON m.id = ms.message_id
       JOIN users u ON u.id = m.sender_id
       WHERE ms.user_id = ? AND m.chat_id = ? AND m.deleted = 0
       ORDER BY ms.created_at DESC
       LIMIT ? OFFSET ?`
    ).all(u.id, params.id, limit + 1, offset);

    return ok({ items: rows.slice(0, limit).map((r) => decryptMessageRow(r)), hasMore: rows.length > limit, offset });
  });
}
