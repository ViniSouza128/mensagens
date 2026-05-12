import { ok, withErrors, readBody } from '@/server/http';
import { requireUser } from '@/server/auth';
import { listContacts, addContact, removeContact, setAlias } from '@/server/handlers/contacts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return withErrors(async () => {
    const u = await requireUser();
    return ok(listContacts(u.id));
  });
}

export async function POST(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const { user_id, alias = null } = await readBody(req);
    return ok(addContact(u.id, user_id, alias));
  });
}

export async function PATCH(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const { user_id, alias } = await readBody(req);
    return ok(setAlias(u.id, user_id, alias ?? null));
  });
}

export async function DELETE(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const { user_id } = await readBody(req);
    return ok(removeContact(u.id, user_id));
  });
}
