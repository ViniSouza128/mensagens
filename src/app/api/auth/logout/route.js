import { ok, withErrors } from '@/server/http';
import { getCurrentUser, clearSessionCookie, destroySession } from '@/server/auth';
import { audit } from '@/server/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  return withErrors(async () => {
    const u = await getCurrentUser();
    if (u) {
      destroySession(u.sid);
      audit({ actorId: u.id, action: 'auth.logout' });
    }
    await clearSessionCookie();
    return ok({});
  });
}
