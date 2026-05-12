import { ok, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { fetchLinkPreview } from '@/server/linkPreview';
import { checkRate } from '@/server/rateLimit';
import { fail } from '@/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const rl = checkRate(`lp:${u.id}`, { windowMs: 60_000, max: 60 });
    if (!rl.allowed) return fail(429, 'rate_limited');
    const url = new URL(req.url).searchParams.get('url');
    if (!url) return ok(null);
    const data = await fetchLinkPreview(url);
    return ok(data);
  });
}
