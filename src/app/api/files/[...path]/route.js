import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { withErrors, fail } from '@/server/http';
import { requireUser } from '@/server/auth';
import { resolveUploadPath } from '@/server/uploads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MIME_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4',
  pdf: 'application/pdf', txt: 'text/plain', json: 'application/json',
};

function guessMime(p) {
  const m = p.match(/\.([a-z0-9]+)$/i);
  if (!m) return 'application/octet-stream';
  return MIME_BY_EXT[m[1].toLowerCase()] || 'application/octet-stream';
}

export async function GET(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    await requireUser(); // exige sessão; a permissão granular fica em fase posterior por chat_id
    const rel = (params.path || []).join('/');
    const abs = resolveUploadPath(rel);
    if (!abs) return fail(403, 'invalid_path');
    if (!fs.existsSync(abs)) return fail(404, 'not_found');
    const stat = fs.statSync(abs);
    const stream = fs.createReadStream(abs);
    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': guessMime(abs),
        'Content-Length': String(stat.size),
        'Cache-Control': 'private, max-age=86400',
      },
    });
  });
}
