import { ok, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { ensureMember } from '@/server/handlers/chats';
import { getDb } from '@/database/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/chats/:id/media?kind=visual|audio|doc&limit=30&offset=0
export async function GET(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    ensureMember(params.id, u.id);

    const url = new URL(req.url);
    const kind = url.searchParams.get('kind') || 'visual';
    const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '30', 10), 100);
    const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10);

    let kindFilter;
    if (kind === 'visual') kindFilter = `a.kind IN ('image','video','gif')`;
    else if (kind === 'audio')  kindFilter = `a.kind = 'audio'`;
    else /* doc */              kindFilter = `a.kind IN ('document','file')`;

    const db = getDb();
    const rows = db.prepare(
      `SELECT a.id, a.message_id, a.kind, a.mime, a.filename, a.size,
              a.width, a.height, a.duration_ms, a.storage_path, a.thumb_path,
              m.created_at, m.sender_id, u.name AS sender_name
       FROM attachments a
       JOIN messages m ON m.id = a.message_id
       JOIN users u ON u.id = m.sender_id
       WHERE m.chat_id = ? AND m.deleted = 0 AND ${kindFilter}
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`
    ).all(params.id, limit + 1, offset);

    return ok({ items: rows.slice(0, limit), hasMore: rows.length > limit, offset });
  });
}
