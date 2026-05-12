import { ok, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { getDb } from '@/database/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET — return the last 10 distinct recent queries for the current user.
 * Groups by query text so duplicates (same term searched multiple times) are
 * collapsed; ordered by the most-recent occurrence.
 */
export async function GET() {
  return withErrors(async () => {
    const u = await requireUser();
    const db = getDb();
    const rows = db.prepare(`
      SELECT query
      FROM search_history
      WHERE user_id = ?
      GROUP BY query
      ORDER BY MAX(created_at) DESC
      LIMIT 10
    `).all(u.id);
    return ok({ history: rows.map((r) => r.query) });
  });
}

/**
 * POST { query } — save a query to history.
 * Ignores queries shorter than 2 chars.
 * Prunes oldest entries beyond 200 to keep the table tidy.
 */
export async function POST(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const { query } = await req.json().catch(() => ({}));
    if (!query || String(query).trim().length < 2) return ok({ ok: true });
    const db = getDb();
    db.prepare('INSERT INTO search_history (user_id, query, created_at) VALUES (?, ?, ?)')
      .run(u.id, String(query).trim().slice(0, 200), Date.now());
    // Keep only the 200 most-recent raw rows per user
    db.prepare(`
      DELETE FROM search_history
      WHERE user_id = ? AND id NOT IN (
        SELECT id FROM search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 200
      )
    `).run(u.id, u.id);
    return ok({ ok: true });
  });
}

/**
 * DELETE — clear history.
 *   No query param  → clear everything for the user.
 *   ?q=<term>       → remove only that specific query.
 */
export async function DELETE(req) {
  return withErrors(async () => {
    const u = await requireUser();
    const url = new URL(req.url);
    const query = url.searchParams.get('q');
    const db = getDb();
    if (query) {
      db.prepare('DELETE FROM search_history WHERE user_id = ? AND query = ?').run(u.id, query);
    } else {
      db.prepare('DELETE FROM search_history WHERE user_id = ?').run(u.id);
    }
    return ok({ ok: true });
  });
}
