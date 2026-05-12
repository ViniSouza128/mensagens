import { ok, fail, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { getUserById, getUserByUsername, publicUser } from '@/server/handlers/users';
import { isContact, isMutualContact, isBlocked } from '@/server/handlers/contacts';
import { getDb } from '@/database/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const me = await requireUser();
    const idOrU = params.id;
    let u = getUserById(idOrU);
    if (!u) u = getUserByUsername(idOrU);
    if (!u) return fail(404, 'user_not_found');
    const contactRow = isContact(me.id, u.id)
      ? getDb().prepare('SELECT alias FROM contacts WHERE owner_id=? AND contact_id=?').get(me.id, u.id)
      : null;
    return ok({
      ...publicUser(u, me.id),
      contact: !!contactRow,
      alias: contactRow?.alias || null,
      mutual: isMutualContact(me.id, u.id),
      blocked_by_me: isBlocked(me.id, u.id),
      blocks_me: isBlocked(u.id, me.id),
      blocks_unknown: !!u.block_unknown,
    });
  });
}
