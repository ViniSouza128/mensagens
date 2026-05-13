import { ok, withErrors } from '@/server/http';
import { requireAdmin } from '@/server/auth/requireAdmin';
import { auditSpyRequest, listSpyUserChats } from '@/server/handlers/adminSpy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const admin = await requireAdmin(req);
    auditSpyRequest({
      req,
      adminId: admin.id,
      action: 'admin.spy.user_chats',
      targetType: 'user',
      targetId: params.userId,
    });
    return ok(listSpyUserChats(params.userId));
  });
}
