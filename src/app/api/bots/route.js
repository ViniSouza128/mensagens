// GET /api/bots — lista os bots LLM disponíveis para conversar.
//
// Bots são usuários normais com `is_bot=1`. Já apareceriam em buscas, mas este
// endpoint é mais barato e dá a metadata necessária para a UI montar a aba
// "Bots" no modal de Nova Conversa (tagline, modelo etc) sem fazer N requests.

import { ok, withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { listBotsPublic } from '@/server/llm/bots';
import { ollamaAlive } from '@/server/llm/ollama';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return withErrors(async () => {
    // Auth obrigatória — mesmo padrão dos demais endpoints. Apenas usuários
    // logados podem listar bots (não há motivo para expor publicamente).
    await requireUser();
    const bots = listBotsPublic();
    // Checa rapidamente se o Ollama tá respondendo — UI pode mostrar aviso
    // tipo "Modelos offline" quando estiver false.
    const ollama_alive = await ollamaAlive();
    return ok({ bots, ollama_alive });
  });
}
