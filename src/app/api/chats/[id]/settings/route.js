import { ok, readBody, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { updateGroupSettings } from '@/server/handlers/groups';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    const body = await readBody(req);
    const settings = updateGroupSettings(params.id, u.id, body);
    return ok({ settings });
  });
}
