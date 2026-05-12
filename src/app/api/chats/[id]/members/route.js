import { ok, readBody, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { addGroupMember } from '@/server/handlers/groups';
import { ensureMember, listMembers } from '@/server/handlers/chats';

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
    addGroupMember(params.id, u.id, body.user_id);
    return ok(listMembers(params.id));
  });
}
