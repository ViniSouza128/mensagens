import { ok, withErrors, readBody } from '@/server/http';
import { requireUser } from '@/server/auth';
import { markRead } from '@/server/handlers/chats';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    const { message_id, ts } = await readBody(req);
    markRead(params.id, u.id, message_id || null, ts || Date.now());
    return ok({});
  });
}
