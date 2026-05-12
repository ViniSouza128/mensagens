import { ok, fail, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { getChat, getMembership, listMembers, decorateChatForUser, getPinnedMessages } from '@/server/handlers/chats';
import { leaveGroup, deleteGroup } from '@/server/handlers/groups';
import { getDb } from '@/database/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    const chat = getChat(params.id);
    if (!chat) return fail(404, 'chat_not_found');
    const m = getMembership(params.id, u.id);
    if (!m || m.left_at) return fail(403, 'not_a_member');
    const db = getDb();
    const row = db
      .prepare(
        `SELECT c.id, c.type, c.name, c.description, c.avatar_path, c.direct_key,
                c.last_message_at, c.created_at,
                cm.pinned, cm.archived, cm.muted_until, cm.draft, cm.draft_updated_at,
                cm.last_read_message_id, cm.last_read_at
         FROM chat_members cm JOIN chats c ON c.id = cm.chat_id
         WHERE c.id = ? AND cm.user_id = ?`
      )
      .get(params.id, u.id);
    const decorated = decorateChatForUser(row, u.id);
    const members = listMembers(params.id);
    const pinned = getPinnedMessages(params.id, u.id);
    // My role in this chat
    const myRole = m.role || 'member';
    return ok({ ...decorated, members, pinned, my_role: myRole });
  });
}

// DELETE — leave group (members/admins) or delete group (owner), or archive direct chat
export async function DELETE(_req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    const chat = getChat(params.id);
    if (!chat) return fail(404, 'chat_not_found');

    if (chat.type === 'group') {
      const m = getMembership(params.id, u.id);
      if (m?.role === 'owner') {
        deleteGroup(params.id, u.id);
      } else {
        leaveGroup(params.id, u.id);
      }
    } else {
      // Direct chat: archive/hide for this user
      const db = getDb();
      db.prepare('UPDATE chat_members SET archived=1 WHERE chat_id=? AND user_id=?').run(params.id, u.id);
    }

    return ok({});
  });
}
