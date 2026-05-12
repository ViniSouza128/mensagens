import { getDb } from '@/database/db';

export function audit({ actorId = null, action, targetType = null, targetId = null, metadata = null }) {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(actorId, action, targetType, targetId, metadata ? JSON.stringify(metadata) : null, Date.now());
  } catch {
    // não derruba o app
  }
}
