// POST /api/chats/[id]/clear
//
// Apaga TODAS as mensagens do chat (texto, anexos, recibos, reações, edições,
// stars, fixados). Para chats com bot: como o bot lê histórico do banco para
// montar o contexto, limpar = bot "esquece" tudo. Equivalente a iniciar
// um novo chat com a mesma persona.
//
// Permissão: requer que o usuário seja membro do chat. Não há cascata para
// outros membros — cada um pode limpar APENAS a própria visão? NÃO: para
// simplificar (e bater com a semântica de "limpar contexto do bot"), o clear
// remove as mensagens GLOBALMENTE. Em chats direct com humanos, ambos os
// lados perdem o histórico (é o trade-off; documente claramente na UI).
//
// Publica `chat.cleared` via SSE para todos os membros recarregarem.

import { ok, withErrors, fail } from '@/server/http';
import { requireUser } from '@/server/auth';
import { ensureMember, listMembers, getChat } from '@/server/handlers/chats';
import { getDb, tx } from '@/database/db';
import { publish } from '@/server/events';
import { audit } from '@/server/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    const chatId = params.id;
    const chat = getChat(chatId);
    if (!chat) return fail(404, 'chat_not_found');
    ensureMember(chatId, u.id);

    const db = getDb();
    const members = listMembers(chatId);

    // Deleta tudo numa transação. ON DELETE CASCADE no schema cuida de
    // receipts/reactions/edits/stars/attachments — só precisamos remover
    // as mensagens em si e o estado de leitura/fixados por membro.
    tx(() => {
      // Limpa pinned_messages e ponteiro de last_read por membro
      db.prepare(
        `UPDATE chat_members
         SET pinned_messages = NULL,
             last_read_message_id = NULL,
             last_read_at = NULL,
             draft = NULL,
             draft_updated_at = NULL
         WHERE chat_id = ?`
      ).run(chatId);
      // Remove todas as mensagens — cascata cuida de attachments,
      // message_receipts, message_reactions, message_stars, message_edits.
      db.prepare('DELETE FROM messages WHERE chat_id = ?').run(chatId);
      // Zera o ponteiro de "última mensagem" do chat — a lista mostra "Sem
      // mensagens ainda" depois disso.
      db.prepare('UPDATE chats SET last_message_at = NULL, updated_at = ? WHERE id = ?')
        .run(Date.now(), chatId);
    });

    audit({
      actorId: u.id,
      action: 'chat.clear',
      targetType: 'chat',
      targetId: chatId,
      metadata: { chat_type: chat.type, members: members.length },
    });

    // Avisa todos os membros conectados via SSE. O front esvazia a lista
    // de mensagens e — para chats de bot — efetivamente reinicia o contexto.
    publish(members.map((m) => m.user_id), {
      type: 'chat.cleared',
      chat_id: chatId,
      cleared_by: u.id,
    });

    return ok({ cleared: true });
  });
}
