// Cliente HTTP para o Ollama rodando localmente (default: http://127.0.0.1:11434).
//
// Apenas o endpoint /api/chat é usado — é mais natural para conversas com
// histórico do que /api/generate. Devolve a resposta completa (não streaming);
// para manter a UI "viva" enquanto a LLM pensa, publicamos `typing.start` via
// SSE antes da chamada e `typing.stop` depois.
//
// Variáveis de ambiente:
//   OLLAMA_HOST       — base URL (default: http://127.0.0.1:11434)
//   OLLAMA_TIMEOUT_MS — timeout total por chamada (default: 180000 = 3 min,
//                       suficiente para modelos grandes como qwen3-coder:30b)

const DEFAULT_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const DEFAULT_TIMEOUT = Number.parseInt(process.env.OLLAMA_TIMEOUT_MS || '180000', 10);

/**
 * Chama POST /api/chat no Ollama.
 *
 * @param {object} args
 * @param {string} args.model — nome do modelo (ex.: 'gemma3:270m')
 * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} args.messages
 * @param {number} [args.temperature=0.8]
 * @param {number} [args.maxTokens=256] — num_predict
 * @param {number} [args.timeoutMs] — timeout total da chamada
 * @param {AbortSignal} [args.signal] — para cancelar externamente
 * @returns {Promise<string>} conteúdo de resposta (assistant), já trim()
 * @throws {Error} se o Ollama estiver inacessível, timeout, ou modelo ausente
 */
export async function ollamaChat({
  model,
  messages,
  temperature = 0.8,
  maxTokens = 256,
  timeoutMs = DEFAULT_TIMEOUT,
  signal = null,
}) {
  // AbortController combinado: timeout + signal externo.
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const url = `${DEFAULT_HOST.replace(/\/$/, '')}/api/chat`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        // Resposta inteira em uma chamada (não streaming).
        stream: false,
        options: {
          temperature,
          // num_predict limita tamanho da resposta — protege contra
          // bots tagarelas e estoura de contexto.
          num_predict: maxTokens,
          // num_ctx alto o suficiente para histórico de conversa.
          num_ctx: 4096,
        },
        keep_alive: '5m',
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ollama_http_${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    // Resposta Ollama: { message: { role: 'assistant', content: '...' }, ... }
    const content = data?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('ollama_invalid_response');
    }
    return content.trim();
  } catch (err) {
    // Normaliza erro de abort/timeout para mensagem clara.
    if (err.name === 'AbortError') {
      throw new Error('ollama_timeout');
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Verifica rapidamente se o Ollama está respondendo (não checa modelos).
 * Útil para painel admin / página de status.
 */
export async function ollamaAlive({ timeoutMs = 1500 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${DEFAULT_HOST.replace(/\/$/, '')}/api/tags`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
