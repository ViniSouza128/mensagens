import { ok, withErrors } from '@/server/http';
import { requireAdmin } from '@/server/auth/requireAdmin';
import { auditSpyRequest, listSpyMessageEdits } from '@/server/handlers/adminSpy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const admin = await requireAdmin(req);
    auditSpyRequest({
      req,
      adminId: admin.id,
      action: 'admin.spy.message_edits',
      targetType: 'message',
      targetId: params.messageId,
    });
    return ok(listSpyMessageEdits(params.messageId));
  });
}
