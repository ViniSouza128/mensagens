import { ok, withErrors, readBody } from '@/server/http';
import { requireUser } from '@/server/auth';
import { updateProfile, setOnboarded } from '@/server/handlers/users';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const body = await readBody(req);
    if (body.onboarded === true) setOnboarded(u.id, true);
    const updated = updateProfile(u.id, body);
    return ok({ id: updated.id });
  });
}
