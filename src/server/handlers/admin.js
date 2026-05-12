import { getDb } from '@/database/db';
import { newId } from '@/lib/id';
import { audit } from '@/server/audit';
import { getMessagesContextForReport } from '@/server/handlers/messages';
import { activeCount } from '@/server/events';

/* ── Reports ──────────────────────────────────────────────── */

export function listReports({ status = null, target_type = null, limit = 50, offset = 0 } = {}) {
  const db = getDb();
  const params = [];
  let where = 'WHERE 1=1';
  if (status) { where += ' AND r.status = ?'; params.push(status); }
  if (target_type) { where += ' AND r.target_type = ?'; params.push(target_type); }
  return db
    .prepare(
      `SELECT r.*, u.username AS reporter_username, u.name AS reporter_name
       FROM reports r LEFT JOIN users u ON u.id = r.reporter_id
       ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
}

export function createReport({ reporterId, target_type, target_id, reason, details = null }) {
  const id = newId();
  const db = getDb();
  db.prepare(
    `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`
  ).run(id, reporterId, target_type, target_id, reason, details, Date.now());
  audit({ actorId: reporterId, action: 'report.create', targetType: target_type, targetId: target_id, metadata: { reason } });
  return { id };
}

export function getReportContext(reportId, adminId) {
  const db = getDb();
  const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
  if (!r) return null;

  let context = null;
  if (r.target_type === 'message') {
    context = getMessagesContextForReport({ messageId: r.target_id, before: 15, after: 5 });
  } else if (r.target_type === 'user') {
    const last = db
      .prepare(`SELECT id FROM messages WHERE sender_id = ? AND deleted = 0 ORDER BY created_at DESC LIMIT 1`)
      .get(r.target_id);
    if (last) context = getMessagesContextForReport({ messageId: last.id, before: 15, after: 5 });
  }

  // Augment messages with sender usernames
  if (Array.isArray(context) && context.length) {
    const senderIds = [...new Set(context.filter((m) => m.sender_id).map((m) => m.sender_id))];
    if (senderIds.length) {
      const ph = senderIds.map(() => '?').join(',');
      const users = db.prepare(`SELECT id, username, name FROM users WHERE id IN (${ph})`).all(...senderIds);
      const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
      context = context.map((m) => ({
        ...m,
        sender_username: m.sender_id ? (userMap[m.sender_id]?.username ?? null) : null,
        sender_name: m.sender_id ? (userMap[m.sender_id]?.name ?? null) : null,
      }));
    }
  }

  audit({ actorId: adminId, action: 'admin.report.view_context', targetType: 'report', targetId: reportId });
  return { report: r, context };
}

export function resolveReport({ reportId, adminId, decision }) {
  const db = getDb();
  // 'reviewing' means admin started looking — don't stamp resolved_at
  if (decision === 'reviewing') {
    db.prepare('UPDATE reports SET status=?, resolved_by=? WHERE id=?').run(decision, adminId, reportId);
  } else {
    db.prepare('UPDATE reports SET status=?, resolved_by=?, resolved_at=? WHERE id=?')
      .run(decision, adminId, Date.now(), reportId);
  }
  audit({
    actorId: adminId,
    action: 'admin.report.resolve',
    targetType: 'report',
    targetId: reportId,
    metadata: { decision },
  });
}

/* ── Audit log ────────────────────────────────────────────── */

export function listAuditLog({ limit = 100, offset = 0, action = null, actor = null } = {}) {
  const db = getDb();
  const params = [];
  let where = 'WHERE 1=1';
  if (action) { where += ' AND a.action LIKE ?'; params.push(`%${action}%`); }
  if (actor) { where += ' AND (u.username LIKE ? OR u.name LIKE ?)'; params.push(`%${actor}%`, `%${actor}%`); }
  return db
    .prepare(
      `SELECT a.*, u.username AS actor_username, u.name AS actor_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
       ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
}

/* ── Error log ────────────────────────────────────────────── */

export function listErrorLog({ limit = 100, offset = 0, level = null, q = null } = {}) {
  const db = getDb();
  const params = [];
  let where = 'WHERE 1=1';
  if (level) { where += ' AND level = ?'; params.push(level); }
  if (q) { where += ' AND (message LIKE ? OR stack LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  return db
    .prepare(`SELECT * FROM error_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
}

/* ── Groups ───────────────────────────────────────────────── */

export function listGroups({ q = null, limit = 50, offset = 0 } = {}) {
  const db = getDb();
  const params = [];
  let where = "c.type = 'group'";
  if (q) {
    where += ' AND (c.name LIKE ? OR c.description LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  return db
    .prepare(
      `SELECT c.id, c.name, c.description, c.avatar_path, c.group_settings,
              c.created_at, c.last_message_at,
              COUNT(CASE WHEN cm.left_at IS NULL THEN 1 END) AS member_count,
              u.username AS creator_username, u.name AS creator_name
       FROM chats c
       LEFT JOIN chat_members cm ON cm.chat_id = c.id
       LEFT JOIN users u ON u.id = c.created_by
       WHERE ${where}
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
}

export function moderateGroup({ chatId, adminId, action, reason = null }) {
  const db = getDb();
  const chat = db.prepare("SELECT * FROM chats WHERE id = ? AND type = 'group'").get(chatId);
  if (!chat) throw Object.assign(new Error('not_found'), { code: 'not_found' });

  if (action === 'delete') {
    db.prepare('DELETE FROM chats WHERE id = ?').run(chatId);
    audit({
      actorId: adminId,
      action: 'admin.group.delete',
      targetType: 'chat',
      targetId: chatId,
      metadata: { reason },
    });
  } else if (action === 'lock') {
    const settings = chat.group_settings ? JSON.parse(chat.group_settings) : {};
    settings.admin_locked = true;
    settings.admin_lock_reason = reason || null;
    db.prepare('UPDATE chats SET group_settings = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(settings), Date.now(), chatId);
    audit({
      actorId: adminId,
      action: 'admin.group.lock',
      targetType: 'chat',
      targetId: chatId,
      metadata: { reason },
    });
  } else if (action === 'unlock') {
    const settings = chat.group_settings ? JSON.parse(chat.group_settings) : {};
    delete settings.admin_locked;
    delete settings.admin_lock_reason;
    db.prepare('UPDATE chats SET group_settings = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(settings), Date.now(), chatId);
    audit({
      actorId: adminId,
      action: 'admin.group.unlock',
      targetType: 'chat',
      targetId: chatId,
      metadata: {},
    });
  } else {
    throw Object.assign(new Error('unknown_action'), { code: 'unknown_action' });
  }
}

/* ── Dashboard stats ──────────────────────────────────────── */

export function dashboardStats() {
  const db = getDb();
  const usersTotal = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const usersAdmin = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE is_admin = 1`).get().n;
  const usersActive = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE status='active'`).get().n;
  const usersSuspended = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE status='suspended'`).get().n;
  const usersBanned = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE status='banned'`).get().n;
  const chats = db.prepare('SELECT COUNT(*) AS n FROM chats').get().n;
  const groups = db.prepare("SELECT COUNT(*) AS n FROM chats WHERE type='group'").get().n;
  const messages = db.prepare('SELECT COUNT(*) AS n FROM messages').get().n;
  const messagesToday = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE created_at > ?')
    .get(Date.now() - 24 * 60 * 60 * 1000).n;
  const reportsOpen = db.prepare(`SELECT COUNT(*) AS n FROM reports WHERE status='open'`).get().n;
  const reportsReviewing = db.prepare(`SELECT COUNT(*) AS n FROM reports WHERE status='reviewing'`).get().n;
  const errors24h = db.prepare(`SELECT COUNT(*) AS n FROM error_log WHERE created_at > ?`)
    .get(Date.now() - 24 * 60 * 60 * 1000).n;
  return {
    usersTotal, usersAdmin, usersActive, usersSuspended, usersBanned,
    chats, groups, messages, messagesToday,
    reportsOpen, reportsReviewing,
    errors24h,
    onlineConnections: activeCount(),
  };
}
