// Orquestrador: dispara resposta de um bot quando um usuário humano
// manda mensagem num chat direto com ele.
//
// Fluxo:
//  1. `maybeBotReply(chatId, recipientBotId, fromUserId)` é chamado fire-and-forget
//     no fim de `sendMessage()`. NUNCA bloqueia o request HTTP do usuário.
//  2. Carrega últimas N mensagens do chat e converte em `messages` Ollama
//     (sender == bot ? 'assistant' : 'user').
//  3. Publica `typing.start` (com flag `thinking:true`) para o usuário humano.
//  4. Chama o Ollama com o system prompt da persona.
//  5. Quebra a resposta em 1-3 chunks (parágrafos curtos), com pequenos delays
//     entre eles para simular digitação humana.
//  6. Envia cada chunk via `sendMessage()` (com senderId = bot).
//  7. Publica `typing.stop` no fim.
//
// Falhas (Ollama offline, timeout, modelo ausente) registram no error_log e
// mandam uma mensagem curta de fallback ao usuário — para ele não ficar
// achando que o bot ignorou.

import { getDb } from '@/database/db';
import { ollamaChat } from '@/server/llm/ollama';
import { publish } from '@/server/events';
import { logger } from '@/server/logger';
import { getBotByUsername } from '@/server/llm/personas';

// Quantas mensagens recentes mandar como contexto para o modelo.
// 20 é equilibrado: cabe em num_ctx=4096 mesmo com mensagens longas,
// e dá memória de curto prazo suficiente para uma conversa fluida.
const CONTEXT_WINDOW = 20;

// Máximo de mensagens (chunks) que um bot pode mandar em uma resposta.
// Evita modelo verborrágico encher a tela.
const MAX_CHUNKS = 3;

// Delay base + por caractere para simular digitação. Calibrado para parecer
// natural sem fazer o usuário esperar demais.
const TYPING_DELAY_BASE_MS = 350;
const TYPING_DELAY_PER_CHAR_MS = 18;
const TYPING_DELAY_MAX_MS = 2200;

/**
 * Quebra a resposta da LLM em 1..MAX_CHUNKS mensagens.
 *
 * Estratégia:
 *  - Respeita linhas em branco (\\n\\n) que o próprio modelo colocou — esse é
 *    o sinal canônico para "manda como mensagem separada".
 *  - Se algum chunk passar de 400 chars, parte em sentenças (`. ` / `? ` / `! `).
 *  - Truncar para no máximo MAX_CHUNKS chunks (junta o excedente no último).
 */
function splitIntoChunks(text) {
  if (!text) return [];
  const collapsed = String(text).replace(/\r\n/g, '\n').trim();
  // Primeiro corte: parágrafos separados por linha em branco.
  let chunks = collapsed.split(/\n{2,}/).map((c) => c.trim()).filter(Boolean);

  // Sub-divide chunks longos por sentença.
  const out = [];
  for (const c of chunks) {
    if (c.length <= 400) { out.push(c); continue; }
    // Divide em sentenças preservando pontuação.
    const sentences = c.match(/[^.!?]+[.!?]?\s*/g) || [c];
    let buf = '';
    for (const s of sentences) {
      if ((buf + s).length > 320 && buf) { out.push(buf.trim()); buf = ''; }
      buf += s;
    }
    if (buf.trim()) out.push(buf.trim());
  }

  // Aplica limite de chunks (junta extras no último).
  if (out.length > MAX_CHUNKS) {
    const tail = out.slice(MAX_CHUNKS - 1).join(' ').trim();
    return [...out.slice(0, MAX_CHUNKS - 1), tail];
  }
  return out.filter(Boolean);
}

/** Tempo plausível de "digitação" para um chunk. */
function typingDelayMs(text) {
  const len = (text || '').length;
  return Math.min(TYPING_DELAY_MAX_MS, TYPING_DELAY_BASE_MS + len * TYPING_DELAY_PER_CHAR_MS);
}

/** Sleep com cancelamento (não usado hoje, mas pronto para AbortSignal futuro). */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Padrões que indicam que o modelo "vazou" sua identidade técnica em uma
// resposta passada (e.g. "I am Gemma, a large language model"). Quando uma
// resposta antiga do BOT bate aqui, ela é REMOVIDA do contexto antes de
// reenviar — caso contrário o histórico polui o priming e o modelo continua
// repetindo o vazamento mesmo com few-shot decente.
const IDENTITY_LEAK_PATTERNS = [
  /\b(i am|i'm) (a |an )?(large )?(language )?(model|ai|assistant)\b/i,
  /\bmy name is (gemma|qwen|mistral|command-r|claude|llama|chatgpt|gpt)\b/i,
  /\b(meu nome é|sou (?:o |a )?)(gemma|qwen|mistral|command-r|claude|llama|chatgpt|gpt)\b/i,
  /\b(google|alibaba|cohere|mistral ai|meta|anthropic|openai) (created|trained|developed|made|me created)\b/i,
  /\bfui (treinad|criad|desenvolvid|fabricad)/i,
  /\b(eu sou|sou um|sou uma) (uma? )?(modelo|ia|assistente|inteligência|llm)\b/i,
];

function looksLikeIdentityLeak(body) {
  if (!body) return false;
  return IDENTITY_LEAK_PATTERNS.some((re) => re.test(body));
}

/**
 * Monta o array de mensagens (system + few-shot + histórico) para mandar ao
 * Ollama.
 *
 * Few-shot priming: pares user/assistant injetados ANTES do histórico real.
 * Necessário para modelos minúsculos (gemma3:270m) que não conseguem manter
 * a persona apenas pelo system prompt — eles defaultam pra "I am Gemma".
 * Imitação > instrução para LLMs pequenas.
 *
 * Sanitização: respostas anteriores do bot que vazaram a identidade técnica
 * (vide IDENTITY_LEAK_PATTERNS) são filtradas — junto com a pergunta que as
 * disparou — para não envenenar o contexto. Mensagens humanas nunca são
 * filtradas.
 */
function buildOllamaMessages(bot, chatId, fewShot = []) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, sender_id, body, deleted
       FROM messages
       WHERE chat_id = ? AND deleted = 0 AND body IS NOT NULL AND body != ''
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(chatId, CONTEXT_WINDOW)
    .reverse();

  // Identifica índices a remover: cada resposta de bot que parece um leak
  // descarta também a pergunta humana imediatamente anterior (para evitar
  // pares Q→A ainda associando "qual seu nome?" com "I am Gemma").
  const drop = new Set();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.sender_id === bot.id && looksLikeIdentityLeak(r.body)) {
      drop.add(i);
      if (i > 0 && rows[i - 1].sender_id !== bot.id) drop.add(i - 1);
    }
  }

  const history = rows
    .map((r, i) => (drop.has(i) ? null : {
      role: r.sender_id === bot.id ? 'assistant' : 'user',
      content: r.body,
    }))
    .filter(Boolean);

  // Expande few_shot [{user,assistant}, ...] em sequência alternada user/assistant.
  const fewShotTurns = (fewShot || []).flatMap((ex) => [
    { role: 'user', content: ex.user },
    { role: 'assistant', content: ex.assistant },
  ]);

  return [
    { role: 'system', content: bot.bot_system_prompt || 'Você é um assistente útil.' },
    ...fewShotTurns,
    ...history,
  ];
}

/**
 * Carrega bot pelo id e devolve só se for um bot ativo.
 */
function loadBot(userId) {
  const u = getDb()
    .prepare('SELECT id, name, username, is_bot, bot_model, bot_system_prompt, bot_temperature, bot_max_tokens, status FROM users WHERE id = ?')
    .get(userId);
  if (!u || !u.is_bot || u.status !== 'active' || !u.bot_model) return null;
  return u;
}

/**
 * Identifica o outro membro de um chat direct. Retorna o ID ou null.
 */
function getDirectOther(chatId, senderId) {
  return getDb()
    .prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ? AND left_at IS NULL')
    .get(chatId, senderId)?.user_id || null;
}

/**
 * Ponto de entrada. Chamado fire-and-forget no fim de `sendMessage()`.
 *
 * Decide internamente se há algo a fazer (chat é direct + recipient é bot).
 * Pega o `sendMessage` por injeção para evitar dependência circular com
 * `handlers/messages.js`.
 *
 * @param {object} args
 * @param {string} args.chatId
 * @param {string} args.senderId — quem mandou a última mensagem (humano)
 * @param {function} args.sendMessage — referência para `sendMessage` do handler
 */
export function maybeBotReply({ chatId, senderId, sendMessage }) {
  const db = getDb();
  const chat = db.prepare('SELECT type FROM chats WHERE id = ?').get(chatId);
  if (!chat || chat.type !== 'direct') return;

  const otherId = getDirectOther(chatId, senderId);
  if (!otherId) return;

  const bot = loadBot(otherId);
  if (!bot) return;

  // Se o "remetente" já é um bot (ex.: bot respondendo a bot via algum
  // futuro fluxo), não dispara recursão infinita.
  const sender = db.prepare('SELECT is_bot FROM users WHERE id = ?').get(senderId);
  if (sender?.is_bot) return;

  // Fire-and-forget. Erros são logados internamente.
  runBotReply({ chatId, bot, sendMessage }).catch((err) => {
    logger.error(`bot ${bot.username} reply failed`, { err: err?.message, chatId });
  });
}

/**
 * Loop principal de resposta. Não bloqueia o request HTTP do usuário.
 */
async function runBotReply({ chatId, bot, sendMessage }) {
  // Indica "X está pensando" — front-end troca o label de "digitando" para
  // "pensando" quando o evento traz `thinking: true`. TTL longo (90s) porque
  // modelos como qwen3-coder:30b podem levar dezenas de segundos.
  publishTyping(chatId, bot, true, 90_000);

  // Cronometra o tempo total de pensamento (chamada Ollama). Esse valor vai
  // dentro do `extra` da mensagem (campo `bot_reply_ms`) — o front mostra
  // "2.3s" à esquerda do horário. Captado por chunk: o primeiro chunk carrega
  // o tempo de raciocínio completo; chunks seguintes (se houver) zeram, pois
  // não houve nova chamada ao modelo.
  const tStart = Date.now();
  let reply;
  try {
    // Few-shot vive em personas.js (não no DB) — busca por username, idempotente.
    const persona = getBotByUsername(bot.username);
    const messages = buildOllamaMessages(bot, chatId, persona?.few_shot || []);
    reply = await ollamaChat({
      model: bot.bot_model,
      messages,
      temperature: bot.bot_temperature ?? 0.8,
      maxTokens: bot.bot_max_tokens ?? 256,
    });
  } catch (err) {
    publishTyping(chatId, bot, false);
    logger.error(`bot ${bot.username} ollama call failed`, { err: err?.message, model: bot.bot_model });
    // Fallback curto pra não deixar o usuário no vácuo. Também marca como
    // mensagem de bot (extra.bot=true) e inclui tempo decorrido até o erro,
    // pra UI poder exibir info diferente em caso de falha.
    try {
      sendMessage({
        chatId,
        senderId: bot.id,
        type: 'text',
        body: '[modelo offline no momento — tenta de novo daqui a pouco]',
        extra: { bot: true, bot_reply_ms: Date.now() - tStart, bot_error: true },
      });
    } catch { /* noop */ }
    return;
  }
  const thinkMs = Date.now() - tStart;

  const chunks = splitIntoChunks(reply);
  if (chunks.length === 0) {
    publishTyping(chatId, bot, false);
    return;
  }

  // Manda cada chunk com delay simulando digitação. Continua publicando
  // typing.start entre chunks para o indicador não sumir.
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await sleep(typingDelayMs(chunk));
    try {
      // Só o primeiro chunk carrega bot_reply_ms (= tempo total que a LLM
      // levou pra raciocinar). Chunks subsequentes são apenas split visual
      // da mesma resposta — recebem bot:true mas sem o duration.
      sendMessage({
        chatId,
        senderId: bot.id,
        type: 'text',
        body: chunk,
        extra: i === 0 ? { bot: true, bot_reply_ms: thinkMs } : { bot: true },
      });
    } catch (err) {
      logger.error(`bot ${bot.username} sendMessage failed`, { err: err?.message });
      break;
    }
    // Antes do próximo chunk, ressinaliza "digitando" (sem flag thinking — agora
    // a mensagem chegou e o bot está só compondo a próxima).
    if (i < chunks.length - 1) {
      publishTyping(chatId, bot, false /* não é mais pensando */, 8000);
    }
  }
  publishTyping(chatId, bot, false);
}

/**
 * Publica `typing.start` ou `typing.stop` para o(s) humano(s) do chat.
 *
 * @param {string} chatId
 * @param {object} bot — row do bot (precisa de id e name)
 * @param {boolean} thinking — true=mostra "está pensando", false=indicador some
 * @param {number} [ttlMs=6000] — quanto tempo o front mantém o indicador antes de auto-clear
 */
function publishTyping(chatId, bot, thinking, ttlMs = 6000) {
  const db = getDb();
  const recipients = db
    .prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ? AND left_at IS NULL')
    .all(chatId, bot.id)
    .map((r) => r.user_id);
  if (!recipients.length) return;

  publish(recipients, {
    type: thinking ? 'typing.start' : 'typing.stop',
    chat_id: chatId,
    user_id: bot.id,
    user_name: bot.name || bot.username,
    thinking: !!thinking,
    ttl_ms: ttlMs,
  });
}

export function listBotsPublic() {
  return getDb()
    .prepare(
      `SELECT id, username, name, bio, avatar_path, bot_model, bot_tagline
       FROM users
       WHERE is_bot = 1 AND status = 'active'
       ORDER BY name COLLATE NOCASE`
    )
    .all();
}
