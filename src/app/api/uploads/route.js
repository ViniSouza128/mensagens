import { ok, fail, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { saveUpload } from '@/server/uploads';
import { checkRate } from '@/server/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Espera multipart/form-data com 1+ arquivos no campo 'file'.
// Parâmetros opcionais: hd (string '1' para HD), kindHint (image|video|audio|document|gif).
export async function POST(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const rl = checkRate(`upload:${u.id}`, { windowMs: 60_000, max: 30 });
    if (!rl.allowed) return fail(429, 'rate_limited');

    const form = await req.formData();
    const files = form.getAll('file');
    const hd = form.get('hd') === '1';
    const kindHint = form.get('kindHint') || null;
    const rotate = Number(form.get('rotate') || 0) || 0;

    if (!files.length) return fail(400, 'no_file');

    const out = [];
    for (const f of files) {
      if (!(f instanceof Blob)) continue;
      const buffer = Buffer.from(await f.arrayBuffer());
      const meta = await saveUpload({
        buffer,
        originalName: f.name || 'arquivo',
        mime: f.type || 'application/octet-stream',
        size: buffer.length,
        hd,
        kindHint,
        rotate,
      });
      out.push(meta);
    }
    return ok(out);
  });
}
