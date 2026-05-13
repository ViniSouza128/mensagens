import { ok, withErrors } from '@/server/http';
import { requireAdmin } from '@/server/auth/requireAdmin';
import { auditSpyRequest, listSpyChatMessages } from '@/server/handlers/adminSpy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const admin = await requireAdmin(req);
    auditSpyRequest({
      req,
      adminId: admin.id,
      action: 'admin.spy.chat_messages',
      targetType: 'chat',
      targetId: params.chatId,
    });
    const url = new URL(req.url);
    const before = url.searchParams.get('before');
    const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100, 100);
    return ok(listSpyChatMessages(params.chatId, {
      before: before ? Number.parseInt(before, 10) : null,
      limit,
      viewerId: admin.id,
    }));
  });
}
