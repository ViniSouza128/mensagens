import { NextResponse } from 'next/server';
import { getDb } from '@/database/db';
import { audit } from '@/server/audit';
import { buildMessages } from '@/server/handlers/messages';
import { decryptMessageEditRow, decryptMessageRow } from '@/server/crypto/messageCrypto';
import { HttpError } from '@/server/auth';

function clampLimit(value, fallback = 50, max = 100) {
  const n = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 1), max);
}

function requestMetadata(req) {
  const url = new URL(req.url);
  return {
    route: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || req.headers.get('x-real-ip')
      || null,
    user_agent: req.headers.get('user-agent') || null,
  };
}

export function auditSpyRequest({ req, adminId, action, targetType = null, targetId = null }) {
  audit({
    actorId: adminId,
    action,
    targetType,
    targetId,
    metadata: requestMetadata(req),
  });
}

function userPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    avatar_path: row.avatar_path,
    last_seen_at: row.last_seen_at,
    online: !!row.online,
    is_bot: !!row.is_bot,
  };
}

function decorateAdminMessages(rows, viewerId = null) {
  if (!rows.length) return [];
  const db = getDb();
  const built = buildMessages(rows, viewerId);
  const senderIds = [...new Set(built.map((m) => m.sender_id).filter(Boolean))];
  const senderMap = {};
  if (senderIds.length) {
    const ph = senderIds.map(() => '?').join(',');
    for (const u of db.prepare(`SELECT id, username, name, avatar_path FROM users WHERE id IN (${ph})`).all(...senderIds)) {
      senderMap[u.id] = u;
    }
  }
  return built.map((m) => {
    const sender = senderMap[m.sender_id] || null;
    return {
      ...m,
      sender: userPublic(sender),
      sender_username: sender?.username || null,
      sender_name: sender?.name || null,
      sender_avatar: sender?.avatar_path || null,
    };
  });
}

export function listSpyUsers({ q = null, includeBots = false, limit = 50, offset = 0 } = {}) {
  const db = getDb();
  const params = [];
  let where = 'WHERE u.status != ?';
  params.push('banned');
  if (!includeBots) where += ' AND u.is_bot = 0';
  if (q) {
    const like = `%${String(q).toLowerCase()}%`;
    where += ' AND (LOWER(u.name) LIKE ? OR u.username_normalized LIKE ? OR LOWER(u.email) LIKE ?)';
    params.push(like, like, like);
  }
  return db.prepare(
    `SELECT u.id, u.username, u.name, u.avatar_path, u.last_seen_at, u.online,
            COUNT(CASE WHEN cm.left_at IS NULL THEN 1 END) AS chat_count
     FROM users u
     LEFT JOIN chat_members cm ON cm.user_id = u.id
     ${where}
     GROUP BY u.id
     ORDER BY u.online DESC, u.name COLLATE NOCASE
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset).map((u) => ({
    ...u,
    online: !!u.online,
    chat_count: u.chat_count || 0,
  }));
}

export function listSpyUserChats(userId) {
  const db = getDb();
  const target = db.prepare('SELECT id, username, name, avatar_path FROM users WHERE id = ?').get(userId);
  if (!target) throw new HttpError(404, 'user_not_found');

  const rows = db.prepare(
    `SELECT c.id AS chat_id, c.type, c.name, c.description, c.avatar_path,
            c.last_message_at, c.created_at,
            (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id) AS message_count
     FROM chat_members cm
     JOIN chats c ON c.id = cm.chat_id
     WHERE cm.user_id = ? AND cm.left_at IS NULL
     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`
  ).all(userId);

  if (!rows.length) return [];
  const chatIds = rows.map((r) => r.chat_id);
  const ph = chatIds.map(() => '?').join(',');

  const peers = {};
  for (const p of db.prepare(
    `SELECT cm.chat_id, u.id, u.username, u.name, u.avatar_path, u.last_seen_at, u.online, u.is_bot
     FROM chat_members cm
     JOIN users u ON u.id = cm.user_id
     JOIN chats c ON c.id = cm.chat_id AND c.type = 'direct'
     WHERE cm.chat_id IN (${ph}) AND cm.user_id != ?`
  ).all(...chatIds, userId)) {
    peers[p.chat_id] = userPublic(p);
  }

  const lastMessages = {};
  for (const raw of db.prepare(
    `WITH ranked AS (
       SELECT m.id, m.chat_id, m.body, m.type, m.sender_id, m.deleted, m.created_at,
              u.name AS sender_name,
              ROW_NUMBER() OVER (PARTITION BY m.chat_id ORDER BY m.created_at DESC) AS rn
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.chat_id IN (${ph})
     )
     SELECT * FROM ranked WHERE rn = 1`
  ).all(...chatIds)) {
    const m = decryptMessageRow(raw);
    lastMessages[m.chat_id] = {
      id: m.id,
      type: m.type,
      body: m.deleted ? null : m.body,
      deleted: !!m.deleted,
      sender_id: m.sender_id,
      sender_name: m.sender_name,
      created_at: m.created_at,
    };
  }

  return rows.map((row) => ({
    id: row.chat_id,
    chat_id: row.chat_id,
    type: row.type,
    name: row.type === 'direct' ? peers[row.chat_id]?.name || 'Conversa direta' : row.name || 'Grupo sem nome',
    description: row.description,
    avatar_path: row.type === 'direct' ? peers[row.chat_id]?.avatar_path || null : row.avatar_path,
    peer: row.type === 'direct' ? peers[row.chat_id] || null : null,
    last_message_at: row.last_message_at || row.created_at,
    last_message: lastMessages[row.chat_id] || null,
    message_count: row.message_count || 0,
    member_count: row.type === 'group'
      ? db.prepare('SELECT COUNT(*) AS n FROM chat_members WHERE chat_id = ? AND left_at IS NULL').get(row.chat_id).n
      : 2,
    pinned: [],
  }));
}

export function listSpyChatMessages(chatId, { before = null, limit = 100, viewerId = null } = {}) {
  const db = getDb();
  const chat = db.prepare('SELECT id FROM chats WHERE id = ?').get(chatId);
  if (!chat) throw new HttpError(404, 'chat_not_found');
  const lim = clampLimit(limit, 100, 100);
  const rows = before
    ? db.prepare(
      `SELECT * FROM messages
       WHERE chat_id = ? AND created_at < ?
       ORDER BY created_at DESC LIMIT ?`
    ).all(chatId, before, lim)
    : db.prepare(
      `SELECT * FROM messages
       WHERE chat_id = ?
       ORDER BY created_at DESC LIMIT ?`
    ).all(chatId, lim);
  return decorateAdminMessages(rows.reverse(), viewerId);
}

export function listSpyMessageEdits(messageId) {
  const db = getDb();
  const msg = db.prepare('SELECT id FROM messages WHERE id = ?').get(messageId);
  if (!msg) throw new HttpError(404, 'message_not_found');
  return db.prepare(
    `SELECT id, message_id, body_before, edited_at
     FROM message_edits
     WHERE message_id = ?
     ORDER BY edited_at ASC`
  ).all(messageId).map((row) => decryptMessageEditRow(row));
}

export function exportSpyUser(userId) {
  const db = getDb();
  const user = db.prepare('SELECT id, username, name, avatar_path FROM users WHERE id = ?').get(userId);
  if (!user) throw new HttpError(404, 'user_not_found');
  const chats = listSpyUserChats(userId);
  const exportedChats = chats.map((chat) => {
    const rows = db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC').all(chat.chat_id);
    return {
      ...chat,
      messages: decorateAdminMessages(rows, null),
    };
  });
  return {
    exported_at: Date.now(),
    user: userPublic(user),
    chats: exportedChats,
  };
}

export function jsonDownload(data, filename) {
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
