import { withErrors } from '@/server/http';
import { requireAdmin } from '@/server/auth/requireAdmin';
import { auditSpyRequest, exportSpyUser, jsonDownload } from '@/server/handlers/adminSpy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function safeFilenamePart(value) {
  return String(value || 'usuario').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'usuario';
}

export async function GET(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const admin = await requireAdmin(req);
    auditSpyRequest({
      req,
      adminId: admin.id,
      action: 'admin.spy.user_export',
      targetType: 'user',
      targetId: params.userId,
    });
    const data = exportSpyUser(params.userId);
    const username = safeFilenamePart(data.user?.username);
    return jsonDownload(data, `export-${username}-${Date.now()}.json`);
  });
}
