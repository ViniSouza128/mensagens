import { ok, fail, readBody, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { addGroupMember } from '@/server/handlers/groups';
import { ensureMember, listMembers } from '@/server/handlers/chats';
import { getDb } from '@/database/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    ensureMember(params.id, u.id);
    const members = listMembers(params.id);
    return ok(members);
  });
}

export async function POST(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    const body = await readBody(req);
    // Bots não podem entrar em grupos — mesmo motivo do endpoint /group:
    // o pipeline de reply só dispara em direct chats. Bloquear evita
    // bot-membro silencioso. Veja src/app/api/chats/group/route.js.
    if (body.user_id) {
      const target = getDb().prepare('SELECT is_bot, name FROM users WHERE id = ?').get(body.user_id);
      if (target?.is_bot) {
        return fail(400, 'bots_cannot_join_groups', { bot_name: target.name });
      }
    }
    addGroupMember(params.id, u.id, body.user_id);
    return ok(listMembers(params.id));
  });
}
