import { ok, withErrors, readBody } from '@/server/http';
import { requireUser } from '@/server/auth';
import { listMessages, sendMessage } from '@/server/handlers/messages';
import { checkRate } from '@/server/rateLimit';
import { fail } from '@/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    const url = new URL(req.url);
    const before = url.searchParams.get('before');
    const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '40', 10) || 40, 100);
    const data = listMessages(params.id, u.id, {
      before: before ? Number.parseInt(before, 10) : null,
      limit,
    });
    return ok(data);
  });
}

export async function POST(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    const rl = checkRate(`msg:${u.id}`, { windowMs: 60_000, max: 60 });
    if (!rl.allowed) return fail(429, 'rate_limited');
    const body = await readBody(req);
    // Constrói `extra` JSON com payloads de poll/voice se presentes.
    let extra = null;
    if (body.poll) extra = { poll: body.poll };
    else if (body.voice) extra = { voice: body.voice };
    const sent = sendMessage({
      chatId: params.id,
      senderId: u.id,
      type: body.type || 'text',
      body: body.body || null,
      replyToId: body.reply_to_id || null,
      attachments: body.attachments || [],
      forwardedFromId: body.forwarded_from_id || null,
      extra,
      client_id: body.client_id || null,
    });
    return ok(sent);
  });
}
