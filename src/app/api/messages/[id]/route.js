import { ok, withErrors, readBody } from '@/server/http';
import { requireUser } from '@/server/auth';
import { editMessage, deleteMessage, getMessageDetails } from '@/server/handlers/messages';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    return ok(getMessageDetails({ messageId: params.id, viewerId: u.id }));
  });
}

export async function PATCH(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    const { body } = await readBody(req);
    return ok(editMessage({ messageId: params.id, userId: u.id, body }));
  });
}

export async function DELETE(_req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    return ok(deleteMessage({ messageId: params.id, userId: u.id }));
  });
}
