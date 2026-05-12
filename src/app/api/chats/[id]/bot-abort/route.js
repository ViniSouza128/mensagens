// POST /api/chats/[id]/bot-abort
//
// Cancela uma resposta de bot LLM em andamento para este chat. A próxima
// chamada ao Ollama é abortada via AbortController e qualquer conteúdo
// já gerado é persistido com flag `bot_cancelled=true` (UI usa pra mostrar
// visual de "interrompida"). Idempotente: chamar com nada rodando devolve
// {aborted:false} sem erro.

import { ok, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { ensureMember } from '@/server/handlers/chats';
import { abortBotReply } from '@/server/llm/bots';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    // Confirma membership — não deixa user aleatório abortar conversa alheia.
    ensureMember(params.id, u.id);
    const aborted = abortBotReply(params.id);
    return ok({ aborted });
  });
}
