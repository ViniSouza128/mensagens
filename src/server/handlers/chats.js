import { getDb } from '@/database/db';
import { HttpError } from '@/server/auth';
import { directKey, newId } from '@/lib/id';
import { publish } from '@/server/events';
import { isBlocked, isContact } from '@/server/handlers/contacts';

export function getChat(chatId) {
  return getDb().prepare('SELECT * FROM chats WHERE id = ?').get(chatId);
}

export function getMembership(chatId, userId) {
  return getDb()
    .prepare('SELECT * FROM chat_members WHERE chat_id=? AND user_id=?')
    .get(chatId, userId);
}

export function ensureMember(chatId, userId) {
  const m = getMembership(chatId, userId);
  if (!m || m.left_at) throw new HttpError(403, 'not_a_member');
  return m;
}

export function listMembers(chatId) {
  return getDb()
    .prepare(
      `SELECT cm.*, u.username, u.name, u.avatar_path, u.last_seen_at, u.online
       FROM chat_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.chat_id = ? AND cm.left_at IS NULL`
    )
    .all(chatId);
}

export function findOrCreateDirectChat(meId, otherId) {
  if (meId === otherId) throw new HttpError(400, 'cannot_chat_self');
  const db = getDb();
  const other = db.prepare('SELECT id FROM users WHERE id = ?').get(otherId);
  if (!other) throw new HttpError(404, 'user_not_found');
  if (isBlocked(otherId, meId)) throw new HttpError(403, 'blocked_by_target');
  if (isBlocked(meId, otherId)) throw new HttpError(403, 'you_blocked_user');

  const key = directKey(meId, otherId);
  // Usa transação para evitar race condition: dois requests simultâneos podem
  // tentar criar o mesmo chat. INSERT OR IGNORE + re-SELECT garante idempotência.
  const createIfAbsent = db.transaction(() => {
    let chat = db.prepare('SELECT * FROM chats WHERE direct_key = ?').get(key);
    if (!chat) {
      const id = newId();
      const now = Date.now();
      db.prepare(
        `INSERT OR IGNORE INTO chats (id, type, direct_key, created_by, created_at, updated_at)
         VALUES (?, 'direct', ?, ?, ?, ?)`
      ).run(id, key, meId, now, now);
      db.prepare(
        `INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, joined_at)
         VALUES (?, ?, 'member', ?)`
      ).run(id, meId, now);
      db.prepare(
        `INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, joined_at)
         VALUES (?, ?, 'member', ?)`
      ).run(id, otherId, now);
      chat = db.prepare('SELECT * FROM chats WHERE direct_key = ?').get(key);
    }
    return chat;
  });
  return createIfAbsent();
}

// Lista chats do usuário com prefixo de última mensagem e contador não lidos.
// Usa batch queries para evitar N+1 (3 queries totais em vez de 3×N).
export function listChatsForUser(userId, { archived = false } = {}) {
  const db = getDb();
  const arch = archived ? 1 : 0;
  const rows = db
    .prepare(
      `SELECT c.id, c.type, c.name, c.description, c.avatar_path, c.direct_key,
              c.last_message_at, c.created_at,
              cm.pinned, cm.archived, cm.muted_until, cm.draft, cm.draft_updated_at,
              cm.last_read_message_id, cm.last_read_at
       FROM chat_members cm
       JOIN chats c ON c.id = cm.chat_id
       WHERE cm.user_id = ? AND cm.left_at IS NULL AND cm.archived = ?
       ORDER BY cm.pinned DESC, COALESCE(c.last_message_at, c.created_at) DESC`
    )
    .all(userId, arch);

  if (!rows.length) return [];

  const chatIds = rows.map((r) => r.id);
  const ph = chatIds.map(() => '?').join(',');

  // Batch 1: parceiros de chats diretos (1 query)
  const partnerMap = {};
  const directIds = rows.filter((r) => r.type === 'direct').map((r) => r.id);
  if (directIds.length) {
    const dph = directIds.map(() => '?').join(',');
    for (const p of db.prepare(
      `SELECT cm.chat_id, u.id, u.username, u.name, u.avatar_path, u.bio,
              u.last_seen_at, u.online, u.privacy_last_seen, u.privacy_avatar,
              u.is_bot, u.bot_model, u.bot_tagline, u.bot_vision
       FROM chat_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.chat_id IN (${dph}) AND cm.user_id != ?`
    ).all(...directIds, userId)) {
      partnerMap[p.chat_id] = p;
    }
  }

  // Batch 2: última mensagem por chat com ROW_NUMBER (1 query)
  const lastMsgMap = {};
  for (const m of db.prepare(
    `WITH ranked AS (
       SELECT m.id, m.chat_id, m.type, m.body, m.sender_id, m.created_at, m.deleted,
              u.name AS sender_name,
              ROW_NUMBER() OVER (PARTITION BY m.chat_id ORDER BY m.created_at DESC) AS rn
       FROM messages m LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.chat_id IN (${ph})
     )
     SELECT * FROM ranked WHERE rn = 1`
  ).all(...chatIds)) {
    lastMsgMap[m.chat_id] = m;
  }

  // Batch 3: contagem de não lidas por chat, respeitando last_read_at individual (1 query)
  const unreadMap = {};
  for (const u of db.prepare(
    `SELECT m.chat_id, COUNT(*) AS n
     FROM messages m
     JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ?
     WHERE m.chat_id IN (${ph})
       AND m.sender_id != ?
       AND m.created_at > COALESCE(cm.last_read_at, 0)
       AND m.deleted = 0
     GROUP BY m.chat_id`
  ).all(userId, ...chatIds, userId)) {
    unreadMap[u.chat_id] = u.n;
  }

  // Batch 4: member counts for group chats (1 query)
  const memberCountMap = {};
  const groupIds = rows.filter((r) => r.type === 'group').map((r) => r.id);
  if (groupIds.length) {
    const gph = groupIds.map(() => '?').join(',');
    for (const mc of db
      .prepare(`SELECT chat_id, COUNT(*) AS n FROM chat_members WHERE chat_id IN (${gph}) AND left_at IS NULL GROUP BY chat_id`)
      .all(...groupIds)) {
      memberCountMap[mc.chat_id] = mc.n;
    }
  }

  return rows.map((row) => {
    const partner = partnerMap[row.id] || null;
    const last = lastMsgMap[row.id] || null;
    const unread = unreadMap[row.id] || 0;
    return {
      id: row.id,
      type: row.type,
      name: row.type === 'direct' ? partner?.name || '' : row.name || '',
      description: row.description,
      avatar_path: row.type === 'direct' ? partner?.avatar_path : row.avatar_path,
      last_message_at: row.last_message_at || row.created_at,
      pinned: !!row.pinned,
      archived: !!row.archived,
      muted: !!(row.muted_until && row.muted_until > Date.now()),
      draft: row.draft || null,
      last_read_at: row.last_read_at || 0,
      last_message: last
        ? {
            id: last.id,
            type: last.type,
            body: last.deleted ? null : last.body,
            deleted: !!last.deleted,
            sender_id: last.sender_id,
            sender_name: last.sender_name,
            created_at: last.created_at,
          }
        : null,
      unread,
      partner,
      member_count: memberCountMap[row.id] || 0,
    };
  });
}

export function decorateChatForUser(row, userId) {
  const db = getDb();
  // partner para directs
  let partner = null;
  if (row.type === 'direct') {
    const m = db
      .prepare(
        `SELECT u.id, u.username, u.name, u.avatar_path, u.bio, u.last_seen_at, u.online,
                u.privacy_last_seen, u.privacy_avatar,
                u.is_bot, u.bot_model, u.bot_tagline, u.bot_vision
         FROM chat_members cm JOIN users u ON u.id = cm.user_id
         WHERE cm.chat_id = ? AND cm.user_id != ?`
      )
      .get(row.id, userId);
    partner = m || null;
  }
  // última mensagem
  const last = db
    .prepare(
      `SELECT m.id, m.type, m.body, m.sender_id, m.created_at, m.deleted,
              u.name AS sender_name
       FROM messages m LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.chat_id = ? ORDER BY m.created_at DESC LIMIT 1`
    )
    .get(row.id);
  // contador de não lidas (mensagens após last_read_at, não do próprio usuário)
  const unread = db
    .prepare(
      `SELECT COUNT(*) AS n FROM messages
       WHERE chat_id = ? AND sender_id != ? AND created_at > COALESCE(?, 0) AND deleted = 0`
    )
    .get(row.id, userId, row.last_read_at || 0).n;

  // Member count for groups
  let member_count = 0;
  if (row.type === 'group') {
    member_count = db.prepare('SELECT COUNT(*) AS n FROM chat_members WHERE chat_id=? AND left_at IS NULL').get(row.id).n;
  }

  // Group settings (parsed)
  let group_settings = null;
  if (row.type === 'group') {
    const raw = db.prepare('SELECT group_settings FROM chats WHERE id=?').get(row.id);
    try { group_settings = JSON.parse(raw?.group_settings || '{}'); } catch { group_settings = {}; }
  }

  return {
    id: row.id,
    type: row.type,
    name: row.type === 'direct' ? partner?.name || '' : row.name || '',
    description: row.description,
    avatar_path: row.type === 'direct' ? partner?.avatar_path : row.avatar_path,
    last_message_at: row.last_message_at || row.created_at,
    pinned: !!row.pinned,
    archived: !!row.archived,
    muted: !!(row.muted_until && row.muted_until > Date.now()),
    draft: row.draft || null,
    last_read_at: row.last_read_at || 0,
    last_message: last
      ? {
          id: last.id,
          type: last.type,
          body: last.deleted ? null : last.body,
          deleted: !!last.deleted,
          sender_id: last.sender_id,
          sender_name: last.sender_name,
          created_at: last.created_at,
        }
      : null,
    unread,
    partner,
    member_count,
    group_settings,
  };
}

export function setPinned(chatId, userId, pinned) {
  ensureMember(chatId, userId);
  getDb().prepare('UPDATE chat_members SET pinned=? WHERE chat_id=? AND user_id=?').run(pinned ? 1 : 0, chatId, userId);
  publish([userId], { type: 'chat.updated', chat_id: chatId });
}

export function setArchived(chatId, userId, archived) {
  ensureMember(chatId, userId);
  getDb().prepare('UPDATE chat_members SET archived=? WHERE chat_id=? AND user_id=?').run(archived ? 1 : 0, chatId, userId);
  publish([userId], { type: 'chat.updated', chat_id: chatId });
}

export function setMuted(chatId, userId, until) {
  ensureMember(chatId, userId);
  getDb().prepare('UPDATE chat_members SET muted_until=? WHERE chat_id=? AND user_id=?').run(until || null, chatId, userId);
  publish([userId], { type: 'chat.updated', chat_id: chatId });
}

export function saveDraft(chatId, userId, draft) {
  ensureMember(chatId, userId);
  getDb()
    .prepare('UPDATE chat_members SET draft=?, draft_updated_at=? WHERE chat_id=? AND user_id=?')
    .run(draft || null, Date.now(), chatId, userId);
}

export function markRead(chatId, userId, messageId, ts) {
  ensureMember(chatId, userId);
  const db = getDb();
  const t = ts || Date.now();
  db.prepare(
    `UPDATE chat_members SET last_read_message_id=?, last_read_at=? WHERE chat_id=? AND user_id=?`
  ).run(messageId, t, chatId, userId);
  // marca recibo de leitura para mensagens até messageId
  if (messageId) {
    const msg = db.prepare('SELECT created_at FROM messages WHERE id = ?').get(messageId);
    if (msg) {
      const others = db
        .prepare(
          `SELECT id FROM messages WHERE chat_id=? AND sender_id != ? AND created_at <= ?`
        )
        .all(chatId, userId, msg.created_at);
      const upsert = db.prepare(
        `INSERT INTO message_receipts (message_id, user_id, delivered_at, read_at)
         VALUES (?, ?, COALESCE((SELECT delivered_at FROM message_receipts WHERE message_id=? AND user_id=?), ?), ?)
         ON CONFLICT(message_id, user_id) DO UPDATE SET read_at = excluded.read_at,
            delivered_at = COALESCE(message_receipts.delivered_at, excluded.delivered_at)`
      );
      const tx = db.transaction((rows) => {
        for (const r of rows) upsert.run(r.id, userId, r.id, userId, t, t);
      });
      tx(others);
      // notifica remetentes
      const senders = db.prepare(
        `SELECT DISTINCT sender_id FROM messages WHERE id IN (${others.map(() => '?').join(',') || 'NULL'})`
      ).all(...others.map((r) => r.id));
      for (const s of senders) {
        publish([s.sender_id], { type: 'message.read', chat_id: chatId, by: userId, at: t });
      }
    }
  }
}

export function setPinnedMessages(chatId, userId, pinnedIds) {
  ensureMember(chatId, userId);
  // Em chats diretos, ambos compartilham o "pin" (a nível de chat).
  const db = getDb();
  const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id=? AND left_at IS NULL').all(chatId);
  const json = JSON.stringify(pinnedIds || []);
  const upd = db.prepare('UPDATE chat_members SET pinned_messages=? WHERE chat_id=? AND user_id=?');
  const tx = db.transaction((rows) => {
    for (const r of rows) upd.run(json, chatId, r.user_id);
  });
  tx(members);
  publish(members.map((m) => m.user_id), { type: 'chat.pins', chat_id: chatId, pinned: pinnedIds });
}

export function getPinnedMessages(chatId, userId) {
  const m = getMembership(chatId, userId);
  if (!m) return [];
  try {
    return JSON.parse(m.pinned_messages || '[]');
  } catch {
    return [];
  }
}

export function isMutualOrSelfChat(meId, otherId) {
  // Só reciprocamente "contato" se ambos se adicionaram.
  return meId === otherId || (isContact(meId, otherId) && isContact(otherId, meId));
}
