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
        // think:false desliga a fase de raciocínio em modelos "thinking"
        // (Qwen3, DeepSeek-R1, etc). Sem isso, modelos como
        // jaahas/qwen3.5-uncensored:4b consomem TODO o num_predict no campo
        // "thinking" e devolvem content vazio — o bot fica em silêncio.
        // Para chat curto/persona não queremos chain-of-thought; o usuário
        // espera resposta direta. Ollama 0.10+ aceita esse campo no top level.
        think: false,
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
    // Algumas versões antigas (Ollama <0.10) podem ignorar think:false e
    // ainda devolver `thinking` no payload; nesse caso usamos content
    // mesmo (que será '' e cai no fallback) — não tem como recuperar
    // o pensamento como resposta sem perder a persona.
    const content = data?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('ollama_invalid_response');
    }
    const trimmed = content.trim();
    if (!trimmed) throw new Error('ollama_empty_content');
    return trimmed;
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
 * Versão streaming do /api/chat. Lê o body como NDJSON e chama `onDelta(text)`
 * para cada chunk recebido. Devolve uma Promise que resolve no fim com o texto
 * completo concatenado (útil para fallback / logging).
 *
 * O Ollama retorna linhas tipo:
 *   {"message":{"content":"Olá"},"done":false}\n
 *   {"message":{"content":" mundo"},"done":false}\n
 *   {"done":true,...}\n
 *
 * Algumas linhas vêm em pedaços (chunked transfer); o parser acumula bytes
 * até achar `\n` e processa linha-a-linha.
 *
 * @param {object} args (mesmos de ollamaChat, +)
 * @param {(text: string) => void} args.onDelta — chamado para cada token novo
 *                                                 (o conteúdo incremental, NÃO o acumulado)
 * @returns {Promise<string>} texto completo da resposta
 */
export async function ollamaChatStream({
  model,
  messages,
  temperature = 0.8,
  maxTokens = 256,
  timeoutMs = DEFAULT_TIMEOUT,
  signal = null,
  onDelta,
}) {
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
        stream: true,
        think: false,
        options: {
          temperature,
          num_predict: maxTokens,
          num_ctx: 4096,
        },
        keep_alive: '5m',
      }),
      signal: ctrl.signal,
    });

    if (!res.ok || !res.body) {
      const body = !res.ok ? await res.text().catch(() => '') : '';
      throw new Error(`ollama_http_${res.status}: ${body.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Processa linhas completas (NDJSON delimitado por \n)
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let evt;
        try { evt = JSON.parse(line); } catch { continue; }
        const piece = evt?.message?.content;
        if (typeof piece === 'string' && piece.length > 0) {
          full += piece;
          try { onDelta?.(piece); } catch { /* ignora erro do callback */ }
        }
        if (evt?.done) {
          // Stream encerrado pelo lado do Ollama. Saímos do loop externo.
          return full.trim();
        }
      }
    }
    return full.trim();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('ollama_timeout');
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
