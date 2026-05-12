import { ok, withErrors, readBody } from '@/server/http';
import { requireUser } from '@/server/auth';
import { pinMessage } from '@/server/handlers/messages';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    const { chat_id, pinned = true } = await readBody(req);
    return ok(pinMessage({ chatId: chat_id, userId: u.id, messageId: params.id, pinned: !!pinned }));
  });
}
