import { ok, withErrors, readBody } from '@/server/http';
import { requireUser } from '@/server/auth';
import { forwardMessages } from '@/server/handlers/messages';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const { message_ids = [], to_chat_ids = [] } = await readBody(req);
    return ok(forwardMessages({ messageIds: message_ids, toChatIds: to_chat_ids, userId: u.id }));
  });
}
