import { getDb } from '@/database/db';
import { HttpError } from '@/server/auth';
import { newId, newShortId } from '@/lib/id';
import { ensureMember, getChat, getMembership } from '@/server/handlers/chats';
import { publish } from '@/server/events';

// ── Defaults & helpers ────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS = {
  edit_info: 'all',            // 'all' | 'admins'
  add_members: 'all',          // 'all' | 'admins'
  invite_link_enabled: false,
  invite_link_visible: 'all',  // 'all' | 'admins'
  invite_token: null,
};

export function parseSettings(raw) {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(raw || '{}') }; } catch { return { ...DEFAULT_SETTINGS }; }
}

function notifyMembers(chatId) {
  const members = getDb()
    .prepare('SELECT user_id FROM chat_members WHERE chat_id=? AND left_at IS NULL')
    .all(chatId);
  publish(members.map((m) => m.user_id), { type: 'chat.updated', chat_id: chatId });
  return members;
}

// ── Role enforcement ──────────────────────────────────────────────────────────

export function requireGroupAdmin(chatId, userId) {
  const m = getMembership(chatId, userId);
  if (!m || m.left_at) throw new HttpError(403, 'not_a_member');
  if (m.role !== 'admin' && m.role !== 'owner') throw new HttpError(403, 'requires_admin');
  return m;
}

export function requireGroupOwner(chatId, userId) {
  const m = getMembership(chatId, userId);
  if (!m || m.left_at) throw new HttpError(403, 'not_a_member');
  if (m.role !== 'owner') throw new HttpError(403, 'requires_owner');
  return m;
}

// ── Group CRUD ────────────────────────────────────────────────────────────────

export function createGroup(creatorId, { name, description, avatarPath, memberIds = [] }) {
  if (!name?.trim()) throw new HttpError(400, 'name_required');
  const db = getDb();
  const id = newId();
  const now = Date.now();
  const settings = { ...DEFAULT_SETTINGS, invite_token: newShortId() };

  db.prepare(
    `INSERT INTO chats (id, type, name, description, avatar_path, created_by, group_settings, created_at, updated_at)
     VALUES (?, 'group', ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name.trim(), description?.trim() || null, avatarPath || null, creatorId, JSON.stringify(settings), now, now);

  // Creator is owner
  db.prepare(
    `INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`
  ).run(id, creatorId, now);

  // Add initial members (skip duplicates and creator)
  const seen = new Set([creatorId]);
  for (const uid of memberIds) {
    if (seen.has(uid)) continue;
    seen.add(uid);
    const user = db.prepare('SELECT id FROM users WHERE id=? AND status=?').get(uid, 'active');
    if (!user) continue;
    db.prepare(
      `INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`
    ).run(id, uid, now);
  }

  const allMembers = db.prepare('SELECT user_id FROM chat_members WHERE chat_id=?').all(id);
  publish(allMembers.map((m) => m.user_id), { type: 'chat.updated', chat_id: id });

  return db.prepare('SELECT * FROM chats WHERE id=?').get(id);
}

export function updateGroupInfo(chatId, userId, { name, description, avatarPath }) {
  const chat = getChat(chatId);
  if (!chat || chat.type !== 'group') throw new HttpError(404, 'chat_not_found');
  const m = ensureMember(chatId, userId);
  const settings = parseSettings(chat.group_settings);

  if (settings.edit_info === 'admins' && m.role !== 'admin' && m.role !== 'owner') {
    throw new HttpError(403, 'requires_admin');
  }

  const db = getDb();
  const parts = [];
  const vals = [];

  if (name !== undefined) { parts.push('name=?'); vals.push(name?.trim() || null); }
  if (description !== undefined) { parts.push('description=?'); vals.push(description?.trim() || null); }
  if (avatarPath !== undefined) { parts.push('avatar_path=?'); vals.push(avatarPath || null); }

  if (parts.length) {
    parts.push('updated_at=?');
    vals.push(Date.now(), chatId);
    db.prepare(`UPDATE chats SET ${parts.join(', ')} WHERE id=?`).run(...vals);
  }

  notifyMembers(chatId);
  return db.prepare('SELECT * FROM chats WHERE id=?').get(chatId);
}

// ── Member management ─────────────────────────────────────────────────────────

export function addGroupMember(chatId, addedById, userId) {
  const chat = getChat(chatId);
  if (!chat || chat.type !== 'group') throw new HttpError(404, 'chat_not_found');
  const adder = ensureMember(chatId, addedById);
  const settings = parseSettings(chat.group_settings);

  if (settings.add_members === 'admins' && adder.role !== 'admin' && adder.role !== 'owner') {
    throw new HttpError(403, 'requires_admin');
  }

  const db = getDb();
  const user = db.prepare(`SELECT id FROM users WHERE id=? AND status='active'`).get(userId);
  if (!user) throw new HttpError(404, 'user_not_found');

  const existing = db.prepare('SELECT * FROM chat_members WHERE chat_id=? AND user_id=?').get(chatId, userId);

  if (existing) {
    if (!existing.left_at && !existing.was_kicked) throw new HttpError(409, 'already_member');
    // Kicked members require admin to re-add
    if (existing.was_kicked && adder.role === 'member') {
      throw new HttpError(403, 'requires_admin_to_readd');
    }
    db.prepare(
      'UPDATE chat_members SET left_at=NULL, was_kicked=0, role=?, joined_at=? WHERE chat_id=? AND user_id=?'
    ).run('member', Date.now(), chatId, userId);
  } else {
    db.prepare(
      'INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)'
    ).run(chatId, userId, 'member', Date.now());
  }

  // Notify existing members + the new member
  const members = notifyMembers(chatId);
  if (!members.find((m) => m.user_id === userId)) {
    publish([userId], { type: 'chat.updated', chat_id: chatId });
  }
  return true;
}

export function removeGroupMember(chatId, removedById, userId) {
  const chat = getChat(chatId);
  if (!chat || chat.type !== 'group') throw new HttpError(404, 'chat_not_found');

  const remover = requireGroupAdmin(chatId, removedById);
  if (removedById === userId) throw new HttpError(400, 'use_leave_to_leave');

  const target = getMembership(chatId, userId);
  if (!target || target.left_at) throw new HttpError(404, 'member_not_found');
  if (target.role === 'owner') throw new HttpError(403, 'cannot_remove_owner');
  // Only owner can remove admins
  if (target.role === 'admin' && remover.role !== 'owner') {
    throw new HttpError(403, 'only_owner_can_remove_admin');
  }

  getDb().prepare(
    'UPDATE chat_members SET left_at=?, was_kicked=1 WHERE chat_id=? AND user_id=?'
  ).run(Date.now(), chatId, userId);

  notifyMembers(chatId);
  publish([userId], { type: 'chat.updated', chat_id: chatId });
  return true;
}

export function updateMemberRole(chatId, byUserId, userId, newRole) {
  const chat = getChat(chatId);
  if (!chat || chat.type !== 'group') throw new HttpError(404, 'chat_not_found');
  if (!['admin', 'member'].includes(newRole)) throw new HttpError(400, 'invalid_role');

  const actor = getMembership(chatId, byUserId);
  if (!actor || actor.left_at) throw new HttpError(403, 'not_a_member');
  if (actor.role !== 'admin' && actor.role !== 'owner') throw new HttpError(403, 'requires_admin');

  const target = getMembership(chatId, userId);
  if (!target || target.left_at) throw new HttpError(404, 'member_not_found');
  if (target.role === 'owner') throw new HttpError(403, 'cannot_change_owner_role');

  // Only owner can demote admins
  if (target.role === 'admin' && newRole === 'member' && actor.role !== 'owner') {
    throw new HttpError(403, 'only_owner_can_demote_admin');
  }

  getDb().prepare(
    'UPDATE chat_members SET role=? WHERE chat_id=? AND user_id=?'
  ).run(newRole, chatId, userId);

  notifyMembers(chatId);
  return true;
}

// ── Group settings ────────────────────────────────────────────────────────────

export function updateGroupSettings(chatId, userId, patch) {
  const chat = getChat(chatId);
  if (!chat || chat.type !== 'group') throw new HttpError(404, 'chat_not_found');
  requireGroupAdmin(chatId, userId);

  const current = parseSettings(chat.group_settings);
  const merged = { ...current };

  if (patch.edit_info !== undefined) merged.edit_info = patch.edit_info === 'admins' ? 'admins' : 'all';
  if (patch.add_members !== undefined) merged.add_members = patch.add_members === 'admins' ? 'admins' : 'all';
  if (patch.invite_link_enabled !== undefined) merged.invite_link_enabled = !!patch.invite_link_enabled;
  if (patch.invite_link_visible !== undefined) merged.invite_link_visible = patch.invite_link_visible === 'admins' ? 'admins' : 'all';
  // Regenerate token on request or if enabling for first time without a token
  if (patch.regenerate_invite || (merged.invite_link_enabled && !merged.invite_token)) {
    merged.invite_token = newShortId();
  }

  getDb().prepare('UPDATE chats SET group_settings=?, updated_at=? WHERE id=?')
    .run(JSON.stringify(merged), Date.now(), chatId);

  notifyMembers(chatId);
  return merged;
}

// ── Leave / delete ────────────────────────────────────────────────────────────

export function leaveGroup(chatId, userId) {
  const chat = getChat(chatId);
  if (!chat || chat.type !== 'group') throw new HttpError(404, 'chat_not_found');
  const m = getMembership(chatId, userId);
  if (!m || m.left_at) throw new HttpError(403, 'not_a_member');
  if (m.role === 'owner') throw new HttpError(400, 'owner_must_transfer_or_delete');

  getDb().prepare('UPDATE chat_members SET left_at=? WHERE chat_id=? AND user_id=?')
    .run(Date.now(), chatId, userId);

  notifyMembers(chatId);
  publish([userId], { type: 'chat.updated', chat_id: chatId });
  return true;
}

export function deleteGroup(chatId, userId) {
  const chat = getChat(chatId);
  if (!chat || chat.type !== 'group') throw new HttpError(404, 'chat_not_found');
  requireGroupOwner(chatId, userId);

  const db = getDb();
  const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id=? AND left_at IS NULL').all(chatId);
  db.prepare('DELETE FROM chats WHERE id=?').run(chatId);
  publish(members.map((m) => m.user_id), { type: 'chat.deleted', chat_id: chatId });
  return true;
}

// ── Transfer ownership ────────────────────────────────────────────────────────

export function transferOwnership(chatId, ownerId, newOwnerId) {
  const chat = getChat(chatId);
  if (!chat || chat.type !== 'group') throw new HttpError(404, 'chat_not_found');
  requireGroupOwner(chatId, ownerId);

  const target = getMembership(chatId, newOwnerId);
  if (!target || target.left_at) throw new HttpError(404, 'member_not_found');

  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE chat_members SET role='member' WHERE chat_id=? AND user_id=?`).run(chatId, ownerId);
    db.prepare(`UPDATE chat_members SET role='owner' WHERE chat_id=? AND user_id=?`).run(chatId, newOwnerId);
    db.prepare('UPDATE chats SET updated_at=? WHERE id=?').run(Date.now(), chatId);
  });
  tx();

  notifyMembers(chatId);
  return true;
}
