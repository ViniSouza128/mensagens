import { ok, withErrors, readBody } from '@/server/http';
import { requireUser } from '@/server/auth';
import { blockUser, unblockUser, listBlocked } from '@/server/handlers/contacts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return withErrors(async () => {
    const u = await requireUser();
    return ok(listBlocked(u.id));
  });
}

export async function POST(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const { user_id, reason = null } = await readBody(req);
    return ok(blockUser(u.id, user_id, reason));
  });
}

export async function DELETE(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const { user_id } = await readBody(req);
    return ok(unblockUser(u.id, user_id));
  });
}
