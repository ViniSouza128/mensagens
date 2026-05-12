import { ok, withErrors, readBody } from '@/server/http';
import { requireUser } from '@/server/auth';
import { getDb } from '@/database/db';
import { newId } from '@/lib/id';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const { topic, body } = await readBody(req);
    const id = newId();
    getDb().prepare(
      `INSERT INTO feedback (id, user_id, topic, body, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(id, u.id, topic || null, String(body || '').slice(0, 4000), Date.now());
    return ok({ id });
  });
}
