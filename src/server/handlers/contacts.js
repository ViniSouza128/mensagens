import { getDb } from '@/database/db';
import { HttpError } from '@/server/auth';
import { newId } from '@/lib/id';
import { audit } from '@/server/audit';
import { publish } from '@/server/events';
import { checkRate } from '@/server/rateLimit';

export function isContact(ownerId, contactId) {
  return !!getDb().prepare('SELECT 1 FROM contacts WHERE owner_id=? AND contact_id=?').get(ownerId, contactId);
}

export function isMutualContact(a, b) {
  return isContact(a, b) && isContact(b, a);
}

export function isBlocked(blockerId, blockedId) {
  return !!getDb().prepare('SELECT 1 FROM blocks WHERE blocker_id=? AND blocked_id=?').get(blockerId, blockedId);
}

export function isEitherBlocked(a, b) {
  return isBlocked(a, b) || isBlocked(b, a);
}

export function listContacts(userId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT u.id, u.username, u.name, u.avatar_path, u.bio, u.last_seen_at, u.online,
              c.alias, c.created_at AS contact_since
       FROM contacts c
       JOIN users u ON u.id = c.contact_id
       WHERE c.owner_id = ? AND u.status = 'active'
       ORDER BY u.name COLLATE NOCASE`
    )
    .all(userId);
}

export function addContact(ownerId, contactId, alias = null) {
  if (ownerId === contactId) throw new HttpError(400, 'cannot_add_self');
  const db = getDb();
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(contactId);
  if (!target) throw new HttpError(404, 'user_not_found');
  if (isBlocked(ownerId, contactId)) throw new HttpError(409, 'is_blocked');
  db.prepare(
    `INSERT INTO contacts (owner_id, contact_id, alias, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(owner_id, contact_id) DO UPDATE SET alias = excluded.alias`
  ).run(ownerId, contactId, alias, Date.now());
  audit({ actorId: ownerId, action: 'contact.add', targetType: 'user', targetId: contactId });
  publish([ownerId], { type: 'contact.added', contact_id: contactId });
  publish([contactId], { type: 'contact.added_by', user_id: ownerId });
  return { ok: true };
}

export function removeContact(ownerId, contactId) {
  const db = getDb();
  db.prepare('DELETE FROM contacts WHERE owner_id=? AND contact_id=?').run(ownerId, contactId);
  audit({ actorId: ownerId, action: 'contact.remove', targetType: 'user', targetId: contactId });
  publish([ownerId], { type: 'contact.removed', contact_id: contactId });
  return { ok: true };
}

export function blockUser(blockerId, blockedId, reason = null) {
  if (blockerId === blockedId) throw new HttpError(400, 'cannot_block_self');
  const db = getDb();
  db.prepare(
    `INSERT INTO blocks (blocker_id, blocked_id, reason, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(blocker_id, blocked_id) DO NOTHING`
  ).run(blockerId, blockedId, reason, Date.now());
  audit({ actorId: blockerId, action: 'user.block', targetType: 'user', targetId: blockedId });
  publish([blockerId], { type: 'user.blocked', user_id: blockedId });
  return { ok: true };
}

export function unblockUser(blockerId, blockedId) {
  const db = getDb();
  db.prepare('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?').run(blockerId, blockedId);
  audit({ actorId: blockerId, action: 'user.unblock', targetType: 'user', targetId: blockedId });
  return { ok: true };
}

export function listBlocked(userId) {
  return getDb()
    .prepare(
      `SELECT u.id, u.username, u.name, u.avatar_path, b.created_at
       FROM blocks b JOIN users u ON u.id = b.blocked_id
       WHERE b.blocker_id = ? ORDER BY b.created_at DESC`
    )
    .all(userId);
}

export function createContactRequest({ fromId, toId, message = null }) {
  if (fromId === toId) throw new HttpError(400, 'cannot_request_self');
  // Previne spam: máximo 10 solicitações por minuto por remetente
  const rl = checkRate(`contact_req:${fromId}`, { windowMs: 60_000, max: 10 });
  if (!rl.allowed) throw new HttpError(429, 'rate_limit_exceeded');
  const db = getDb();
  const target = db.prepare('SELECT id, block_unknown FROM users WHERE id = ?').get(toId);
  if (!target) throw new HttpError(404, 'user_not_found');
  if (isBlocked(toId, fromId)) throw new HttpError(403, 'blocked_by_target');
  // Se já é contato dele, não precisa de request.
  if (isContact(toId, fromId)) {
    return { ok: true, status: 'already_contact' };
  }
  // Se há pendente, retorna o existente.
  const existing = db
    .prepare('SELECT * FROM contact_requests WHERE from_id=? AND to_id=? AND status=\'pending\'')
    .get(fromId, toId);
  if (existing) return { ok: true, request: existing };

  const id = newId();
  db.prepare(
    `INSERT INTO contact_requests (id, from_id, to_id, message, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?)`
  ).run(id, fromId, toId, message, Date.now());
  publish([toId], { type: 'contact_request.new', request_id: id, from_id: fromId });
  return { ok: true, request_id: id };
}

export function listIncomingRequests(userId) {
  return getDb()
    .prepare(
      `SELECT cr.*, u.username, u.name, u.avatar_path
       FROM contact_requests cr JOIN users u ON u.id = cr.from_id
       WHERE cr.to_id = ? AND cr.status = 'pending'
       ORDER BY cr.created_at DESC`
    )
    .all(userId);
}

export function listOutgoingRequests(userId) {
  return getDb()
    .prepare(
      `SELECT cr.*, u.username, u.name, u.avatar_path
       FROM contact_requests cr JOIN users u ON u.id = cr.to_id
       WHERE cr.from_id = ? AND cr.status = 'pending'
       ORDER BY cr.created_at DESC`
    )
    .all(userId);
}

export function respondContactRequest({ requestId, userId, accept }) {
  const db = getDb();
  const req = db.prepare('SELECT * FROM contact_requests WHERE id = ?').get(requestId);
  if (!req) throw new HttpError(404, 'request_not_found');
  if (req.to_id !== userId) throw new HttpError(403, 'forbidden');
  if (req.status !== 'pending') throw new HttpError(409, 'already_responded');

  const newStatus = accept ? 'accepted' : 'rejected';
  // Remove any previous entry with the target status to avoid UNIQUE constraint violations
  db.prepare('DELETE FROM contact_requests WHERE from_id=? AND to_id=? AND status=? AND id!=?')
    .run(req.from_id, req.to_id, newStatus, requestId);
  db.prepare('UPDATE contact_requests SET status=?, responded_at=? WHERE id=?')
    .run(newStatus, Date.now(), requestId);

  if (accept) {
    addContact(userId, req.from_id);
  }
  publish([req.from_id], { type: 'contact_request.responded', request_id: requestId, accepted: !!accept });
  return { ok: true };
}

// Silently dismisses a request without notifying the sender
export function ignoreContactRequest({ requestId, userId }) {
  const db = getDb();
  const req = db.prepare('SELECT * FROM contact_requests WHERE id = ?').get(requestId);
  if (!req) throw new HttpError(404, 'request_not_found');
  if (req.to_id !== userId) throw new HttpError(403, 'forbidden');
  if (req.status !== 'pending') throw new HttpError(409, 'already_responded');
  db.prepare('UPDATE contact_requests SET status=?, responded_at=? WHERE id=?')
    .run('ignored', Date.now(), requestId);
  return { ok: true };
}

// Block the sender and silently reject the request
export function blockAndRejectRequest({ requestId, userId }) {
  const db = getDb();
  const req = db.prepare('SELECT * FROM contact_requests WHERE id = ?').get(requestId);
  if (!req) throw new HttpError(404, 'request_not_found');
  if (req.to_id !== userId) throw new HttpError(403, 'forbidden');
  if (req.status !== 'pending') throw new HttpError(409, 'already_responded');
  // Delete any previous rejected entry for this pair to avoid UNIQUE constraint violations
  db.prepare('DELETE FROM contact_requests WHERE from_id=? AND to_id=? AND status=? AND id!=?')
    .run(req.from_id, req.to_id, 'rejected', requestId);
  db.prepare('UPDATE contact_requests SET status=?, responded_at=? WHERE id=?')
    .run('rejected', Date.now(), requestId);
  blockUser(userId, req.from_id);
  return { ok: true };
}

// Update local alias for a contact
export function setAlias(ownerId, contactId, alias) {
  const db = getDb();
  const result = db
    .prepare('UPDATE contacts SET alias=? WHERE owner_id=? AND contact_id=?')
    .run(alias || null, ownerId, contactId);
  if (result.changes === 0) throw new HttpError(404, 'contact_not_found');
  return { ok: true };
}
