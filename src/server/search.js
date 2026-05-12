/**
 * Search engine — global search and in-chat search.
 *
 * Multi-pass strategy (each category):
 *   Pass 1 — Strict FTS5 AND: all tokens required (highest precision)
 *   Pass 2 — Relaxed FTS5 OR: any token matches (broader recall)
 *   Pass 3 — Fuzzy FTS5 OR: each token OR'd with shorter prefix (~65%) for typo tolerance
 *   Pass 4 — LIKE fallback: plain substring on normalized fields (safety net)
 *
 * Passes accumulate+dedup until `limitPerKind + offset + 1` unique results are found
 * (the +1 lets us detect whether there are more results beyond the current page).
 * Results include sender/chat context and <mark>-delimited snippet strings.
 */

import { getDb } from '@/database/db';
import { normalize } from '@/lib/normalize';
import { tokenize, multipassFts, makeSnippet, markTerms } from '@/lib/searchQuery';

// FTS5 snippet() options: 32 tokens of context, <mark> delimiters
const SNIP = `'<mark>', '</mark>', '…', 32`;

export function globalSearch(viewerId, raw, { limitPerKind = 10, offset = 0 } = {}) {
  const tokens = tokenize(raw);
  if (!tokens.length) return { users: [], chats: [], messages: [], files: [], hasMore: {} };

  const db = getDb();
  const like = `%${normalize(raw)}%`;
  // Fetch one extra row beyond what we need so we can detect hasMore
  const fetchLimit = limitPerKind + offset + 1;

  // ── USERS ──────────────────────────────────────────────────────────────────
  let rawUsers = multipassFts(
    tokens,
    (q) => db.prepare(`
      SELECT u.id, u.username, u.name, u.avatar_path, u.bio
      FROM users_fts f
      JOIN users u ON u.rowid = f.rowid
      WHERE users_fts MATCH ? AND u.id != ? AND u.status = 'active'
      ORDER BY rank LIMIT ?
    `).all(q, viewerId, fetchLimit),
    (r) => r.id,
    fetchLimit
  );
  if (rawUsers.length === 0) {
    rawUsers = db.prepare(`
      SELECT id, username, name, avatar_path, bio FROM users
      WHERE (username_normalized LIKE ? OR LOWER(name) LIKE ?)
        AND id != ? AND status = 'active'
      LIMIT ?
    `).all(like, like, viewerId, fetchLimit);
  }
  const hasMoreUsers = rawUsers.length > offset + limitPerKind;
  const users = rawUsers.slice(offset, offset + limitPerKind).map((u) => ({
    ...u,
    name_hl: markTerms(u.name, tokens),
    username_hl: markTerms(u.username, tokens),
  }));

  // ── CHATS ──────────────────────────────────────────────────────────────────
  // Groups via FTS on chat name / description
  let rawGroupChats = multipassFts(
    tokens,
    (q) => db.prepare(`
      SELECT c.id, c.type, c.name, c.description, c.avatar_path,
             NULL AS partner_id, NULL AS partner_username,
             NULL AS partner_name, NULL AS partner_avatar
      FROM chats_fts f
      JOIN chats c ON c.rowid = f.rowid
      JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = ? AND cm.left_at IS NULL
      WHERE chats_fts MATCH ? AND c.type = 'group'
      ORDER BY rank LIMIT ?
    `).all(viewerId, q, fetchLimit),
    (r) => r.id,
    fetchLimit
  );

  // Direct chats searched by partner name / username via LIKE
  // (partner names are not stored in chats_fts)
  const rawDirectChats = db.prepare(`
    SELECT DISTINCT c.id, c.type, c.name, c.description, c.avatar_path,
           p.id AS partner_id, p.username AS partner_username,
           p.name AS partner_name, p.avatar_path AS partner_avatar
    FROM chat_members cm
    JOIN chats c ON c.id = cm.chat_id AND c.type = 'direct'
    JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id != cm.user_id
    JOIN users p ON p.id = cm2.user_id
    WHERE cm.user_id = ? AND cm.left_at IS NULL
      AND (LOWER(p.name) LIKE ? OR p.username_normalized LIKE ?)
    LIMIT ?
  `).all(viewerId, like, like, fetchLimit);

  // Merge groups + direct chats, dedup by id
  const chatSeen = new Set(rawGroupChats.map((c) => c.id));
  const allChats = [...rawGroupChats];
  for (const c of rawDirectChats) {
    if (!chatSeen.has(c.id)) { chatSeen.add(c.id); allChats.push(c); }
  }

  const hasMoreChats = allChats.length > offset + limitPerKind;
  const chats = allChats.slice(offset, offset + limitPerKind).map((c) => ({
    ...c,
    name_hl: markTerms(c.name || c.partner_name, tokens),
  }));

  // ── MESSAGES ───────────────────────────────────────────────────────────────
  let rawMessages = multipassFts(
    tokens,
    (q) => db.prepare(`
      SELECT m.id, m.chat_id, m.sender_id, m.body, m.created_at, m.type,
             snippet(messages_fts, 0, ${SNIP}) AS snippet,
             sender.name AS sender_name,
             COALESCE(c.name, p.name) AS chat_name
      FROM messages_fts
      JOIN messages m ON m.rowid = messages_fts.rowid
      JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ? AND cm.left_at IS NULL
      JOIN users sender ON sender.id = m.sender_id
      JOIN chats c ON c.id = m.chat_id
      LEFT JOIN chat_members cm2
        ON cm2.chat_id = m.chat_id AND cm2.user_id != cm.user_id AND c.type = 'direct'
      LEFT JOIN users p ON p.id = cm2.user_id
      WHERE messages_fts MATCH ? AND m.deleted = 0
      ORDER BY rank LIMIT ?
    `).all(viewerId, q, fetchLimit),
    (r) => r.id,
    fetchLimit
  );

  if (rawMessages.length === 0) {
    const likeMsgs = db.prepare(`
      SELECT m.id, m.chat_id, m.sender_id, m.body, m.created_at, m.type,
             sender.name AS sender_name,
             COALESCE(c.name, p.name) AS chat_name
      FROM messages m
      JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ? AND cm.left_at IS NULL
      JOIN users sender ON sender.id = m.sender_id
      JOIN chats c ON c.id = m.chat_id
      LEFT JOIN chat_members cm2
        ON cm2.chat_id = m.chat_id AND cm2.user_id != cm.user_id AND c.type = 'direct'
      LEFT JOIN users p ON p.id = cm2.user_id
      WHERE m.deleted = 0 AND LOWER(m.body) LIKE ?
      ORDER BY m.created_at DESC LIMIT ?
    `).all(viewerId, like, fetchLimit);
    rawMessages = likeMsgs.map((m) => ({ ...m, snippet: makeSnippet(m.body, tokens) }));
  }

  const hasMoreMessages = rawMessages.length > offset + limitPerKind;
  const messages = rawMessages.slice(offset, offset + limitPerKind);

  // ── FILES ──────────────────────────────────────────────────────────────────
  let rawFiles = multipassFts(
    tokens,
    (q) => db.prepare(`
      SELECT a.id, a.message_id, a.kind, a.filename, a.mime, a.thumb_path, a.size,
             m.chat_id, m.created_at, m.body AS caption
      FROM attachments_fts f
      JOIN attachments a ON a.rowid = f.rowid
      JOIN messages m ON m.id = a.message_id
      JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ? AND cm.left_at IS NULL
      WHERE attachments_fts MATCH ? AND cm.left_at IS NULL
      ORDER BY rank LIMIT ?
    `).all(viewerId, q, fetchLimit),
    (r) => r.id,
    fetchLimit
  );

  if (rawFiles.length === 0) {
    rawFiles = db.prepare(`
      SELECT a.id, a.message_id, a.kind, a.filename, a.mime, a.thumb_path, a.size,
             m.chat_id, m.created_at, m.body AS caption
      FROM attachments a
      JOIN messages m ON m.id = a.message_id
      JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ? AND cm.left_at IS NULL
      WHERE LOWER(COALESCE(a.filename, '')) LIKE ? AND cm.left_at IS NULL
      ORDER BY m.created_at DESC LIMIT ?
    `).all(viewerId, like, fetchLimit);
  }

  const hasMoreFiles = rawFiles.length > offset + limitPerKind;
  const files = rawFiles.slice(offset, offset + limitPerKind).map((f) => ({
    ...f,
    filename_hl: markTerms(f.filename, tokens),
  }));

  return {
    users,
    chats,
    messages,
    files,
    hasMore: { users: hasMoreUsers, chats: hasMoreChats, messages: hasMoreMessages, files: hasMoreFiles },
  };
}

/**
 * Search messages inside a single chat.
 * Validates membership, multi-pass FTS5 with LIKE fallback.
 */
export function searchInChat(chatId, viewerId, raw, { limit = 30, offset = 0 } = {}) {
  const tokens = tokenize(raw);
  if (!tokens.length) return { results: [], hasMore: false };

  const db = getDb();
  const member = db
    .prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ? AND left_at IS NULL')
    .get(chatId, viewerId);
  if (!member) return { results: [], hasMore: false };

  const fetchLimit = limit + offset + 1;

  let rawRows = multipassFts(
    tokens,
    (q) => db.prepare(`
      SELECT m.id, m.chat_id, m.sender_id, m.body, m.created_at, m.type,
             snippet(messages_fts, 0, ${SNIP}) AS snippet,
             sender.name AS sender_name, sender.username AS sender_username,
             sender.avatar_path AS sender_avatar
      FROM messages_fts
      JOIN messages m ON m.rowid = messages_fts.rowid
      JOIN users sender ON sender.id = m.sender_id
      WHERE messages_fts MATCH ? AND m.chat_id = ? AND m.deleted = 0
      ORDER BY m.created_at DESC LIMIT ?
    `).all(q, chatId, fetchLimit),
    (r) => r.id,
    fetchLimit
  );

  // LIKE fallback
  if (rawRows.length === 0) {
    const like = `%${normalize(raw)}%`;
    const likeRows = db.prepare(`
      SELECT m.id, m.chat_id, m.sender_id, m.body, m.created_at, m.type,
             sender.name AS sender_name, sender.username AS sender_username,
             sender.avatar_path AS sender_avatar
      FROM messages m
      JOIN users sender ON sender.id = m.sender_id
      WHERE m.chat_id = ? AND m.deleted = 0 AND LOWER(m.body) LIKE ?
      ORDER BY m.created_at DESC LIMIT ?
    `).all(chatId, like, fetchLimit);
    rawRows = likeRows.map((r) => ({ ...r, snippet: makeSnippet(r.body, tokens) }));
  }

  const hasMore = rawRows.length > offset + limit;
  return { results: rawRows.slice(offset, offset + limit), hasMore };
}
