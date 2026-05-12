import { getDb } from '@/database/db';
import { HttpError } from '@/server/auth';
import { newId } from '@/lib/id';
import { ensureMember, getChat, listMembers } from '@/server/handlers/chats';
import { isBlocked, isContact, createContactRequest } from '@/server/handlers/contacts';
import { publish } from '@/server/events';
import { audit } from '@/server/audit';
import { maybeBotReply } from '@/server/llm/bots';

function safeParse(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }

const EDIT_WINDOW_MS = 4 * 60 * 60 * 1000;

export function buildMessage(row, viewerId) {
  if (!row) return null;
  const db = getDb();
  const attachments = db.prepare('SELECT * FROM attachments WHERE message_id = ?').all(row.id);
  const reactions = db.prepare('SELECT user_id, emoji FROM message_reactions WHERE message_id = ?').all(row.id);
  const reply = row.reply_to_id ? db.prepare('SELECT id, sender_id, body, type, deleted FROM messages WHERE id=?').get(row.reply_to_id) : null;
  const starred = viewerId
    ? !!db.prepare('SELECT 1 FROM message_stars WHERE message_id=? AND user_id=?').get(row.id, viewerId)
    : false;

  // status: para directs, derivar do receipt do outro
  const chat = getChat(row.chat_id);
  let status = 'sent';
  if (row.deleted) status = 'deleted';
  else if (chat?.type === 'direct') {
    const member = db
      .prepare('SELECT user_id FROM chat_members WHERE chat_id=? AND user_id != ?')
      .get(row.chat_id, row.sender_id);
    if (member) {
      const r = db
        .prepare('SELECT delivered_at, read_at FROM message_receipts WHERE message_id=? AND user_id=?')
        .get(row.id, member.user_id);
      if (r?.read_at) status = 'read';
      else if (r?.delivered_at) status = 'delivered';
    }
  }

  return {
    id: row.id,
    chat_id: row.chat_id,
    sender_id: row.sender_id,
    type: row.type,
    body: row.deleted ? null : row.body,
    deleted: !!row.deleted,
    edited_at: row.edited_at,
    edit_count: row.edit_count,
    forwarded_from_id: row.forwarded_from_id,
    reply_to: reply
      ? {
          id: reply.id,
          sender_id: reply.sender_id,
          body: reply.deleted ? null : reply.body,
          type: reply.type,
          deleted: !!reply.deleted,
        }
      : null,
    attachments,
    reactions,
    starred,
    status,
    created_at: row.created_at,
    ...(row.extra ? safeParse(row.extra) : {}),
  };
}

/**
 * Versão batch de buildMessage: carrega attachments, reactions, stars,
 * reply_to e receipts em consultas IN únicas em vez de N consultas individuais.
 * Use em operações de listagem; buildMessage() continua para operações de item único.
 */
export function buildMessages(rows, viewerId) {
  if (!rows.length) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');

  // 1. attachments
  const attMap = {};
  for (const a of db.prepare(`SELECT * FROM attachments WHERE message_id IN (${ph})`).all(...ids)) {
    (attMap[a.message_id] ||= []).push(a);
  }

  // 2. reactions
  const rxMap = {};
  for (const r of db.prepare(`SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id IN (${ph})`).all(...ids)) {
    (rxMap[r.message_id] ||= []).push({ user_id: r.user_id, emoji: r.emoji });
  }

  // 3. stars (viewer)
  const starSet = new Set();
  if (viewerId) {
    for (const s of db.prepare(`SELECT message_id FROM message_stars WHERE message_id IN (${ph}) AND user_id = ?`).all(...ids, viewerId)) {
      starSet.add(s.message_id);
    }
  }

  // 4. reply_to (batch por ids únicos de reply)
  const replyIds = [...new Set(rows.filter((r) => r.reply_to_id).map((r) => r.reply_to_id))];
  const replyMap = {};
  if (replyIds.length) {
    const rph = replyIds.map(() => '?').join(',');
    for (const r of db.prepare(`SELECT id, sender_id, body, type, deleted FROM messages WHERE id IN (${rph})`).all(...replyIds)) {
      replyMap[r.id] = r;
    }
  }

  // 5. chats (normalmente apenas 1 em listMessages, mas suporta múltiplos)
  const chatIds = [...new Set(rows.map((r) => r.chat_id))];
  const cph = chatIds.map(() => '?').join(',');
  const chatMap = {};
  for (const c of db.prepare(`SELECT id, type FROM chats WHERE id IN (${cph})`).all(...chatIds)) {
    chatMap[c.id] = c;
  }

  // 6. status para direct chats: members + receipts em batch
  const receiptMap = {}; // message_id -> receipt do outro membro
  const directChatIds = chatIds.filter((cid) => chatMap[cid]?.type === 'direct');
  if (directChatIds.length) {
    const dcph = directChatIds.map(() => '?').join(',');
    const memberRows = db.prepare(
      `SELECT chat_id, user_id FROM chat_members WHERE chat_id IN (${dcph}) AND left_at IS NULL`
    ).all(...directChatIds);
    const chatMembers = {};
    for (const m of memberRows) (chatMembers[m.chat_id] ||= []).push(m.user_id);

    const directMsgIds = rows.filter((r) => chatMap[r.chat_id]?.type === 'direct' && !r.deleted).map((r) => r.id);
    if (directMsgIds.length) {
      const dmph = directMsgIds.map(() => '?').join(',');
      const recRows = db.prepare(
        `SELECT message_id, user_id, delivered_at, read_at FROM message_receipts WHERE message_id IN (${dmph})`
      ).all(...directMsgIds);
      const recByMsg = {};
      for (const r of recRows) ((recByMsg[r.message_id] ||= {})[r.user_id] = r);

      for (const row of rows) {
        if (chatMap[row.chat_id]?.type !== 'direct' || row.deleted) continue;
        const otherId = (chatMembers[row.chat_id] || []).find((uid) => uid !== row.sender_id);
        if (otherId) receiptMap[row.id] = recByMsg[row.id]?.[otherId] || null;
      }
    }
  }

  return rows.map((row) => {
    let status = 'sent';
    if (row.deleted) {
      status = 'deleted';
    } else if (chatMap[row.chat_id]?.type === 'direct') {
      const r = receiptMap[row.id];
      if (r?.read_at) status = 'read';
      else if (r?.delivered_at) status = 'delivered';
    }

    const reply = row.reply_to_id ? replyMap[row.reply_to_id] : null;
    return {
      id: row.id,
      chat_id: row.chat_id,
      sender_id: row.sender_id,
      type: row.type,
      body: row.deleted ? null : row.body,
      deleted: !!row.deleted,
      edited_at: row.edited_at,
      edit_count: row.edit_count,
      forwarded_from_id: row.forwarded_from_id,
      reply_to: reply
        ? {
            id: reply.id,
            sender_id: reply.sender_id,
            body: reply.deleted ? null : reply.body,
            type: reply.type,
            deleted: !!reply.deleted,
          }
        : null,
      attachments: attMap[row.id] || [],
      reactions: rxMap[row.id] || [],
      starred: starSet.has(row.id),
      status,
      created_at: row.created_at,
      // Espalha campos de extra (poll, voice) ao topo da mensagem para facilitar uso no front
      ...(row.extra ? safeParse(row.extra) : {}),
    };
  });
}

export function listMessages(chatId, viewerId, { before = null, limit = 40 } = {}) {
  ensureMember(chatId, viewerId);
  const db = getDb();
  const lim = Math.min(Math.max(limit, 1), 100);
  // Filtra mensagens que ESTE viewer escondeu via "delete só pra mim"
  // (tabela message_hides). NOT EXISTS é eficiente porque message_hides
  // tem PK composta (message_id, user_id) com índice implícito.
  const rows = before
    ? db
        .prepare(
          `SELECT m.* FROM messages m WHERE m.chat_id = ? AND m.created_at < ?
             AND NOT EXISTS (SELECT 1 FROM message_hides h WHERE h.message_id = m.id AND h.user_id = ?)
           ORDER BY m.created_at DESC LIMIT ?`
        )
        .all(chatId, before, viewerId, lim)
    : db
        .prepare(
          `SELECT m.* FROM messages m WHERE m.chat_id = ?
             AND NOT EXISTS (SELECT 1 FROM message_hides h WHERE h.message_id = m.id AND h.user_id = ?)
           ORDER BY m.created_at DESC LIMIT ?`
        )
        .all(chatId, viewerId, lim);
  return buildMessages(rows.reverse(), viewerId);
}

export function sendMessage({
  chatId,
  senderId,
  type = 'text',
  body = null,
  replyToId = null,
  attachments = [],
  forwardedFromId = null,
  extra = null,
  client_id = null,
}) {
  const db = getDb();
  const chat = getChat(chatId);
  if (!chat) throw new HttpError(404, 'chat_not_found');
  ensureMember(chatId, senderId);

  const trimmedBody = typeof body === 'string' ? body.trim() : body;

  // Mensagem vazia só é erro para 'text' sem attachments. Polls/voice/etc são válidos sem body.
  if ((!trimmedBody || trimmedBody.length === 0) && (!attachments || attachments.length === 0) && !extra && type === 'text') {
    throw new HttpError(400, 'empty_message');
  }

  // Bloqueio direct
  if (chat.type === 'direct') {
    const other = db
      .prepare('SELECT user_id FROM chat_members WHERE chat_id=? AND user_id != ?')
      .get(chatId, senderId);
    if (other) {
      if (isBlocked(other.user_id, senderId)) {
        throw new HttpError(403, 'blocked_by_target');
      }
      if (isBlocked(senderId, other.user_id)) {
        throw new HttpError(403, 'you_blocked_user');
      }
      // bloqueio de desconhecidos: se destinatário não tem o remetente como contato e block_unknown=1
      if (!isContact(other.user_id, senderId)) {
        const target = db.prepare('SELECT block_unknown FROM users WHERE id = ?').get(other.user_id);
        if (target?.block_unknown) {
          // cria solicitação discreta e não entrega
          createContactRequest({ fromId: senderId, toId: other.user_id, message: typeof body === 'string' ? body.slice(0, 280) : null });
          throw new HttpError(409, 'requires_contact_request');
        }
      }
    }
  }

  const id = newId();
  const now = Date.now();
  const extraJson = extra ? JSON.stringify(extra) : null;
  db.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, type, body, reply_to_id, forwarded_from_id, extra, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, chatId, senderId, type, trimmedBody, replyToId, forwardedFromId, extraJson, now);

  // attachments
  for (const att of attachments || []) {
    db.prepare(
      `INSERT INTO attachments (id, message_id, kind, mime, filename, size, width, height, duration_ms,
                                 storage_path, thumb_path, poster_path, hd, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      att.id || newId(),
      id,
      att.kind,
      att.mime || null,
      att.filename || null,
      att.size || null,
      att.width || null,
      att.height || null,
      att.duration_ms || null,
      att.storage_path,
      att.thumb_path || null,
      att.poster_path || null,
      att.hd ? 1 : 0,
      now
    );
  }

  db.prepare('UPDATE chats SET last_message_at = ?, updated_at = ? WHERE id = ?').run(now, now, chatId);

  // limpa rascunho do remetente
  db.prepare('UPDATE chat_members SET draft = NULL, draft_updated_at = ? WHERE chat_id=? AND user_id=?').run(now, chatId, senderId);

  // marca como entregue para destinatários online (heurística simples: todos que têm canal SSE)
  const members = listMembers(chatId).filter((m) => m.user_id !== senderId);
  const upRec = db.prepare(
    `INSERT INTO message_receipts (message_id, user_id, delivered_at)
     VALUES (?, ?, ?)
     ON CONFLICT(message_id, user_id) DO UPDATE SET delivered_at = excluded.delivered_at`
  );
  for (const m of members) {
    upRec.run(id, m.user_id, now);
  }

  const built = buildMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(id), senderId);

  publish([senderId, ...members.map((m) => m.user_id)], {
    type: 'message.new',
    chat_id: chatId,
    message: built,
    client_id: client_id || null,
  });

  // Dispara resposta automática se o chat for direct com um bot (LLM Ollama).
  // Fire-and-forget — não bloqueia o request HTTP. A própria função decide
  // internamente se há algo a fazer.
  try { maybeBotReply({ chatId, senderId, sendMessage }); }
  catch { /* defensive — bot replies nunca devem derrubar mensagem normal */ }

  return built;
}

export function editMessage({ messageId, userId, body }) {
  const db = getDb();
  const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!m) throw new HttpError(404, 'message_not_found');
  if (m.sender_id !== userId) throw new HttpError(403, 'forbidden');
  if (m.deleted) throw new HttpError(409, 'message_deleted');

  // critério: até 4h, OU ainda não lida por nenhum destinatário
  const ageOk = Date.now() - m.created_at <= EDIT_WINDOW_MS;
  const readByOthers = !!db
    .prepare(
      `SELECT 1 FROM message_receipts WHERE message_id = ? AND read_at IS NOT NULL AND user_id != ? LIMIT 1`
    )
    .get(messageId, userId);
  if (!ageOk && readByOthers) throw new HttpError(409, 'edit_window_closed');
  if (typeof body !== 'string' || body.trim().length === 0) throw new HttpError(400, 'empty_message');
  if (body.length > 8000) throw new HttpError(413, 'message_too_long');

  db.prepare(`INSERT INTO message_edits (message_id, body_before, edited_at) VALUES (?, ?, ?)`)
    .run(messageId, m.body, Date.now());
  db.prepare(`UPDATE messages SET body = ?, edited_at = ?, edit_count = edit_count + 1 WHERE id = ?`)
    .run(body.trim(), Date.now(), messageId);

  const built = buildMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId), userId);
  const members = listMembers(m.chat_id);
  publish(members.map((mm) => mm.user_id), { type: 'message.updated', chat_id: m.chat_id, message: built });
  return built;
}

/**
 * Apaga uma mensagem APENAS PARA ESTE USUÁRIO. A mensagem continua existindo
 * no DB e visível para os outros membros do chat — só some da view do user
 * que pediu o hide.
 *
 * Não publica SSE (a outra ponta não precisa saber).
 */
export function hideMessageForUser({ messageId, userId }) {
  const db = getDb();
  const m = db.prepare('SELECT id, chat_id FROM messages WHERE id = ?').get(messageId);
  if (!m) throw new HttpError(404, 'message_not_found');
  // Confirma que o usuário é membro do chat (não deixa ocultar mensagens
  // de chats que ele nem participa).
  ensureMember(m.chat_id, userId);
  db.prepare(
    `INSERT INTO message_hides (message_id, user_id, hidden_at)
     VALUES (?, ?, ?)
     ON CONFLICT(message_id, user_id) DO NOTHING`
  ).run(messageId, userId, Date.now());
  return { ok: true, hidden: true };
}

export function deleteMessage({ messageId, userId }) {
  const db = getDb();
  const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!m) throw new HttpError(404, 'message_not_found');
  if (m.sender_id !== userId) throw new HttpError(403, 'forbidden');
  db.prepare(`UPDATE messages SET deleted = 1, deleted_at = ?, body = NULL WHERE id = ?`).run(Date.now(), messageId);
  // remove anexos do FS opcionalmente — mantemos por enquanto (apenas marca deletado)
  const built = buildMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId), userId);
  const members = listMembers(m.chat_id);
  publish(members.map((mm) => mm.user_id), { type: 'message.deleted', chat_id: m.chat_id, message: built });
  return built;
}

export function reactToMessage({ messageId, userId, emoji }) {
  const db = getDb();
  const m = db.prepare('SELECT chat_id FROM messages WHERE id = ?').get(messageId);
  if (!m) throw new HttpError(404, 'message_not_found');
  ensureMember(m.chat_id, userId);
  if (!emoji) {
    db.prepare('DELETE FROM message_reactions WHERE message_id=? AND user_id=?').run(messageId, userId);
  } else {
    db.prepare(
      `INSERT INTO message_reactions (message_id, user_id, emoji, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji, created_at = excluded.created_at`
    ).run(messageId, userId, emoji, Date.now());
  }
  const members = listMembers(m.chat_id);
  publish(members.map((mm) => mm.user_id), { type: 'message.reaction', chat_id: m.chat_id, message_id: messageId });
  return { ok: true };
}

export function starMessage({ messageId, userId, starred }) {
  const db = getDb();
  if (starred) {
    db.prepare(
      `INSERT INTO message_stars (message_id, user_id, created_at) VALUES (?, ?, ?)
       ON CONFLICT(message_id, user_id) DO NOTHING`
    ).run(messageId, userId, Date.now());
  } else {
    db.prepare('DELETE FROM message_stars WHERE message_id=? AND user_id=?').run(messageId, userId);
  }
  return { ok: true };
}

export function getMessageDetails({ messageId, viewerId }) {
  const db = getDb();
  const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!m) throw new HttpError(404, 'message_not_found');
  ensureMember(m.chat_id, viewerId);
  const edits = db
    .prepare('SELECT body_before, edited_at FROM message_edits WHERE message_id=? ORDER BY edited_at ASC')
    .all(messageId);
  const receipts = db
    .prepare(
      `SELECT mr.user_id, mr.delivered_at, mr.read_at, u.name, u.username
       FROM message_receipts mr JOIN users u ON u.id = mr.user_id
       WHERE mr.message_id = ?`
    )
    .all(messageId);
  return {
    message: buildMessage(m, viewerId),
    edits,
    receipts,
  };
}

export function pinMessage({ chatId, userId, messageId, pinned }) {
  const db = getDb();
  ensureMember(chatId, userId);
  const m = db.prepare('SELECT id FROM messages WHERE id = ? AND chat_id = ?').get(messageId, chatId);
  if (!m) throw new HttpError(404, 'message_not_found');
  // Aplica a todos os membros (a nível de chat).
  const all = db.prepare('SELECT user_id, pinned_messages FROM chat_members WHERE chat_id=? AND left_at IS NULL').all(chatId);
  const upd = db.prepare('UPDATE chat_members SET pinned_messages=? WHERE chat_id=? AND user_id=?');
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      let arr = [];
      try { arr = JSON.parse(r.pinned_messages || '[]'); } catch { arr = []; }
      const set = new Set(arr);
      if (pinned) set.add(messageId);
      else set.delete(messageId);
      upd.run(JSON.stringify([...set]), chatId, r.user_id);
    }
  });
  tx(all);
  publish(all.map((r) => r.user_id), { type: 'chat.pins', chat_id: chatId });
  return { ok: true };
}

export function forwardMessages({ messageIds, toChatIds, userId }) {
  const db = getDb();
  const out = [];
  for (const chatId of toChatIds) {
    ensureMember(chatId, userId);
    for (const mid of messageIds) {
      const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(mid);
      if (!m || m.deleted) continue;
      const atts = db.prepare('SELECT * FROM attachments WHERE message_id = ?').all(mid);
      const built = sendMessage({
        chatId,
        senderId: userId,
        type: m.type,
        body: m.body,
        attachments: atts.map((a) => ({
          kind: a.kind,
          mime: a.mime,
          filename: a.filename,
          size: a.size,
          width: a.width,
          height: a.height,
          duration_ms: a.duration_ms,
          storage_path: a.storage_path,
          thumb_path: a.thumb_path,
          poster_path: a.poster_path,
          hd: a.hd,
        })),
        forwardedFromId: m.id,
      });
      out.push(built);
    }
  }
  audit({ actorId: userId, action: 'message.forward', metadata: { count: messageIds.length, targets: toChatIds.length } });
  return out;
}

export function getMessagesContextForReport({ messageId, before = 15, after = 5 }) {
  const db = getDb();
  const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!m) return null;
  const beforeRows = db
    .prepare(
      `SELECT * FROM messages WHERE chat_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(m.chat_id, m.created_at, before)
    .reverse();
  const afterRows = db
    .prepare(
      `SELECT * FROM messages WHERE chat_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?`
    )
    .all(m.chat_id, m.created_at, after);
  return buildMessages([...beforeRows, m, ...afterRows], null);
}
