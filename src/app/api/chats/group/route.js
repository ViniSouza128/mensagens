import { ok, readBody, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { createGroup } from '@/server/handlers/groups';
import { decorateChatForUser, getMembership } from '@/server/handlers/chats';
import { getDb } from '@/database/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const body = await readBody(req);
    const raw = createGroup(u.id, {
      name: body.name,
      description: body.description || null,
      avatarPath: body.avatar_path || null,
      memberIds: Array.isArray(body.member_ids) ? body.member_ids : [],
    });
    const db = getDb();
    const m = getMembership(raw.id, u.id);
    const row = db.prepare(
      `SELECT c.id, c.type, c.name, c.description, c.avatar_path, c.direct_key,
              c.last_message_at, c.created_at,
              cm.pinned, cm.archived, cm.muted_until, cm.draft, cm.draft_updated_at,
              cm.last_read_message_id, cm.last_read_at
       FROM chat_members cm JOIN chats c ON c.id = cm.chat_id
       WHERE c.id = ? AND cm.user_id = ?`
    ).get(raw.id, u.id);
    const decorated = decorateChatForUser(row, u.id);
    return ok(decorated);
  });
}
