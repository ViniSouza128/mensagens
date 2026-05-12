import { ok, withErrors, readBody } from '@/server/http';
import { requireUser } from '@/server/auth';
import { starMessage } from '@/server/handlers/messages';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    const { starred = true } = await readBody(req);
    return ok(starMessage({ messageId: params.id, userId: u.id, starred: !!starred }));
  });
}
