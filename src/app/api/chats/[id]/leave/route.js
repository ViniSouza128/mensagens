import { ok, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { leaveGroup } from '@/server/handlers/groups';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    leaveGroup(params.id, u.id);
    return ok({});
  });
}
