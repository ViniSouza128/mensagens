import { ok, withErrors, readBody } from '@/server/http';
import { requireUser } from '@/server/auth';
import { setPinned, setArchived, setMuted, saveDraft } from '@/server/handlers/chats';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    const body = await readBody(req);
    if (typeof body.pinned === 'boolean') setPinned(params.id, u.id, body.pinned);
    if (typeof body.archived === 'boolean') setArchived(params.id, u.id, body.archived);
    if ('muted_until' in body) setMuted(params.id, u.id, body.muted_until);
    if ('draft' in body) saveDraft(params.id, u.id, body.draft);
    return ok({});
  });
}
