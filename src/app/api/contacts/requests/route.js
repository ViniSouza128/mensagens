import { ok, withErrors, readBody } from '@/server/http';
import { requireUser } from '@/server/auth';
import {
  createContactRequest,
  listIncomingRequests,
  listOutgoingRequests,
  respondContactRequest,
  ignoreContactRequest,
  blockAndRejectRequest,
} from '@/server/handlers/contacts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const url = new URL(req.url);
    const dir = url.searchParams.get('direction') || 'incoming';
    if (dir === 'outgoing') return ok(listOutgoingRequests(u.id));
    return ok(listIncomingRequests(u.id));
  });
}

export async function POST(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const { user_id, message = null } = await readBody(req);
    return ok(createContactRequest({ fromId: u.id, toId: user_id, message }));
  });
}

export async function PATCH(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const body = await readBody(req);
    const { request_id, action, accept } = body;
    if (action === 'ignore') return ok(ignoreContactRequest({ requestId: request_id, userId: u.id }));
    if (action === 'block') return ok(blockAndRejectRequest({ requestId: request_id, userId: u.id }));
    return ok(respondContactRequest({ requestId: request_id, userId: u.id, accept: !!accept }));
  });
}
