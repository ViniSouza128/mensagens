import { ok, readBody, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { updateGroupInfo } from '@/server/handlers/groups';
import { decorateChatForUser, getMembership } from '@/server/handlers/chats';
import { getDb } from '@/database/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    const body = await readBody(req);
    await updateGroupInfo(params.id, u.id, {
      name: body.name,
      description: body.description,
      avatarPath: body.avatar_path,
    });
    const db = getDb();
    const row = db.prepare(
      `SELECT c.id, c.type, c.name, c.description, c.avatar_path, c.direct_key,
              c.last_message_at, c.created_at,
              cm.pinned, cm.archived, cm.muted_until, cm.draft, cm.draft_updated_at,
              cm.last_read_message_id, cm.last_read_at
       FROM chat_members cm JOIN chats c ON c.id = cm.chat_id
       WHERE c.id = ? AND cm.user_id = ?`
    ).get(params.id, u.id);
    return ok(decorateChatForUser(row, u.id));
  });
}
