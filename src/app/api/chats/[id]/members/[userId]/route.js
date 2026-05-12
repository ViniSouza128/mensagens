import { ok, readBody, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { removeGroupMember, updateMemberRole, transferOwnership } from '@/server/handlers/groups';
import { listMembers } from '@/server/handlers/chats';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// PATCH /api/chats/:id/members/:userId — promote / demote / transfer ownership
export async function PATCH(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    const body = await readBody(req);

    if (body.transfer_ownership) {
      transferOwnership(params.id, u.id, params.userId);
    } else if (body.role !== undefined) {
      updateMemberRole(params.id, u.id, params.userId, body.role);
    }

    return ok(listMembers(params.id));
  });
}

// DELETE /api/chats/:id/members/:userId — remove / kick member
export async function DELETE(_req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    removeGroupMember(params.id, u.id, params.userId);
    return ok(listMembers(params.id));
  });
}
