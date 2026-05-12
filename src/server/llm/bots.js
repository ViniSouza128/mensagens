// Orquestrador: dispara resposta de um bot quando um usuário humano
// manda mensagem num chat direto com ele.
//
// Fluxo (v2, streaming):
//  1. `maybeBotReply` é chamado fire-and-forget no fim de `sendMessage()`.
//     Não bloqueia o request HTTP do usuário.
//  2. Carrega últimas N mensagens do chat (com sanitização de leaks) +
//     few-shot da persona e monta o array Ollama.
//  3. Publica `typing.start` (`thinking:true`) — front mostra "pensando…".
//  4. Abre stream do Ollama (`ollamaChatStream`) — tokens chegam ao vivo.
//  5. Para CADA token novo:
//     - Acumula em `bubbleBuf`.
//     - Publica `bot.stream` com texto-acumulado-do-bubble (front mostra
//       o balão crescendo em tempo real).
//     - Se detectar `\n\n` no buffer: corta o trecho antes do `\n\n`,
//       persiste como mensagem real via `sendMessage()` (com timing),
//       reinicia `bubbleBuf` para o trecho depois do `\n\n`.
//  6. Quando o stream do Ollama termina, persiste o último bubble com
//     `bot_total_ms` (tempo total da resposta inteira).
//  7. Publica `typing.stop` no fim.
//
// Erros (Ollama offline, timeout, etc) registram no error_log e mandam uma
// mensagem curta de fallback ao usuário — para ele não ficar achando que o
// bot ignorou.

import { getDb } from '@/database/db';
import { ollamaChatStream } from '@/server/llm/ollama';
import { publish } from '@/server/events';
import { logger } from '@/server/logger';
import { getBotByUsername } from '@/server/llm/personas';

// Quantas mensagens recentes mandar como contexto para o modelo.
const CONTEXT_WINDOW = 20;

// Map de respostas de bot em andamento, indexadas por chatId.
// Permite cancelar uma resposta no meio quando o usuário aperta o botão
// "parar". Cada entrada: { abort: AbortController, startedAt: number }.
const inFlight = new Map();

/** Aborta a resposta em andamento (se houver) de um chat. Idempotente. */
export function abortBotReply(chatId) {
  const entry = inFlight.get(chatId);
  if (!entry) return false;
  try { entry.abort.abort(); } catch { /* noop */ }
  inFlight.delete(chatId);
  return true;
}

// Máximo de bubbles que um bot pode emitir em uma resposta. Evita modelo
// verborrágico explodir a tela. Se o output tiver mais que isso, juntamos
// no último.
const MAX_BUBBLES = 4;

// Tamanho máximo (caracteres) de um bubble antes de forçar quebra mesmo sem
// `\n\n`. Evita um único parágrafo gigante engolir tudo.
const MAX_BUBBLE_CHARS = 600;

// Debounce de SSE `bot.stream` — não vale a pena mandar um evento por token
// quando 5 chegam em 30ms; agrupa em janela curta. Mantém UX fluida sem
// inundar o socket.
const STREAM_DEBOUNCE_MS = 80;

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
 * Ollama. Filtra respostas antigas do próprio bot que vazaram identidade.
 *
 * Para bots de visão (bot_vision=1): a ÚLTIMA mensagem do usuário (a que
 * disparou a resposta) tem seus attachments de imagem convertidos pra base64
 * e anexados no campo `images` daquele turno — formato esperado pelo Ollama
 * em `/api/chat` para modelos vision (llava, qwen-vl, etc).
 */
function buildOllamaMessages(bot, chatId, fewShot = []) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, sender_id, body, deleted
       FROM messages
       WHERE chat_id = ? AND deleted = 0 AND (body IS NOT NULL OR id IN (SELECT message_id FROM attachments))
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(chatId, CONTEXT_WINDOW)
    .reverse();

  // Identifica índices a remover: cada resposta de bot que parece um leak
  // descarta também a pergunta humana imediatamente anterior.
  const drop = new Set();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.sender_id === bot.id && looksLikeIdentityLeak(r.body)) {
      drop.add(i);
      if (i > 0 && rows[i - 1].sender_id !== bot.id) drop.add(i - 1);
    }
  }

  const lastIdx = rows.length - 1;
  const history = rows
    .map((r, i) => {
      if (drop.has(i)) return null;
      const turn = {
        role: r.sender_id === bot.id ? 'assistant' : 'user',
        content: r.body || '',
      };
      // Vision: anexa imagens APENAS no último turno humano (limita
      // payload — modelos vision não lidam bem com várias imagens
      // espalhadas em histórico longo, e contexto cresce demais).
      if (bot.bot_vision && i === lastIdx && turn.role === 'user') {
        const images = loadImagesAsBase64(r.id);
        if (images.length) turn.images = images;
      }
      return turn;
    })
    .filter(Boolean);

  const fewShotTurns = (fewShot || []).flatMap((ex) => [
    { role: 'user', content: ex.user },
    { role: 'assistant', content: ex.assistant },
  ]);

  return [
    { role: 'system', content: bot.bot_system_prompt || 'Você é um assistente útil. Sempre responda em português brasileiro.' },
    ...fewShotTurns,
    ...history,
  ];
}

/**
 * Lê os attachments de imagem de uma mensagem e devolve como array de base64
 * (sem prefixo `data:`). Ollama espera só o conteúdo base64 puro no campo
 * `images` da chamada `/api/chat`.
 */
function loadImagesAsBase64(messageId) {
  const fs = require('node:fs');
  const path = require('node:path');
  const db = getDb();
  const atts = db
    .prepare("SELECT storage_path FROM attachments WHERE message_id = ? AND kind IN ('image','gif')")
    .all(messageId);
  if (!atts.length) return [];
  // `paths.uploadsDir` aponta para a raiz de uploads/. storage_path já vem
  // com prefixo "originals/" então fica `uploads/originals/<arquivo>`.
  // Importa lazy pra evitar custo de cold start em chats sem vision bot.
  const { paths } = require('@/config/env');
  const out = [];
  for (const a of atts) {
    try {
      const abs = path.join(paths.uploadsDir, a.storage_path);
      if (!fs.existsSync(abs)) continue;
      const buf = fs.readFileSync(abs);
      // Limita 5 MB por imagem — modelos vision já têm dificuldade com >2 MB.
      if (buf.length > 5 * 1024 * 1024) continue;
      out.push(buf.toString('base64'));
      // Limite hard de 3 imagens por turno (Ollama vision performa mal com mais).
      if (out.length >= 3) break;
    } catch { /* skip */ }
  }
  return out;
}

function loadBot(userId) {
  const u = getDb()
    .prepare('SELECT id, name, username, is_bot, bot_model, bot_system_prompt, bot_temperature, bot_max_tokens, bot_vision, status FROM users WHERE id = ?')
    .get(userId);
  if (!u || !u.is_bot || u.status !== 'active' || !u.bot_model) return null;
  return u;
}

function getDirectOther(chatId, senderId) {
  return getDb()
    .prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ? AND left_at IS NULL')
    .get(chatId, senderId)?.user_id || null;
}

/**
 * Ponto de entrada. Chamado fire-and-forget no fim de `sendMessage()`.
 */
export function maybeBotReply({ chatId, senderId, sendMessage }) {
  const db = getDb();
  const chat = db.prepare('SELECT type FROM chats WHERE id = ?').get(chatId);
  if (!chat || chat.type !== 'direct') return;

  const otherId = getDirectOther(chatId, senderId);
  if (!otherId) return;

  const bot = loadBot(otherId);
  if (!bot) return;

  // Anti-loop: bot respondendo a bot não dispara nova resposta.
  const sender = db.prepare('SELECT is_bot FROM users WHERE id = ?').get(senderId);
  if (sender?.is_bot) return;

  runBotReply({ chatId, bot, sendMessage }).catch((err) => {
    logger.error(`bot ${bot.username} reply failed (outer)`, { err: err?.message, chatId });
    try { publishTypingStop(chatId, bot); } catch { /* noop */ }
  });
}

/**
 * Loop principal: streaming do Ollama, multi-bubble com timing por bubble
 * e total no último.
 */
async function runBotReply({ chatId, bot, sendMessage }) {
  // Se já tem uma resposta rodando pra este chat, aborta a anterior antes
  // de começar a nova. Evita responses concorrentes confusas (e.g. usuário
  // mandou 2 msgs rápidas, antes o bot tentaria responder as duas em
  // paralelo gerando intercalação).
  abortBotReply(chatId);

  // AbortController dessa rodada — também é exposto via abortBotReply() pra
  // cancelamento explícito do usuário (botão "parar" no front).
  const abortCtrl = new AbortController();
  inFlight.set(chatId, { abort: abortCtrl, startedAt: Date.now() });

  // Estado "está pensando" (front mostra "pensando…") com TTL longo. Vai virar
  // "escrevendo…" assim que chegar o primeiro token (publishTyping com
  // thinking:false).
  publishThinking(chatId, bot);

  const tStart = Date.now();   // início absoluto da resposta (pra bot_total_ms)
  let bubbleStart = tStart;    // início deste bubble (pra bot_reply_ms por bubble)
  let bubbleBuf = '';
  let bubbleIdx = 0;
  let firstTokenSeen = false;
  let lastStreamPublishedAt = 0;
  let lastStreamLen = 0;

  // Publica `bot.stream` com o texto-acumulado-do-bubble. Debounced.
  // Front-end mostra um "ghost bubble" em tempo real.
  const publishStream = (forceFlush = false) => {
    const now = Date.now();
    if (!forceFlush && now - lastStreamPublishedAt < STREAM_DEBOUNCE_MS) return;
    if (!forceFlush && bubbleBuf.length === lastStreamLen) return;
    lastStreamPublishedAt = now;
    lastStreamLen = bubbleBuf.length;
    publish(getRecipientIds(chatId, bot.id), {
      type: 'bot.stream',
      chat_id: chatId,
      user_id: bot.id,
      user_name: bot.name || bot.username,
      bubble_idx: bubbleIdx,
      content: bubbleBuf,
    });
  };

  // Persiste um bubble. `isFinal` indica se é o último — só ele recebe
  // `bot_total_ms`. Retorna a mensagem persistida (id, etc).
  const flushBubble = (isFinal) => {
    const body = bubbleBuf.trim();
    if (!body) return null;
    const replyMs = Date.now() - bubbleStart;
    const extra = {
      bot: true,
      bot_reply_ms: replyMs,
      bot_bubble_idx: bubbleIdx,
    };
    if (isFinal) extra.bot_total_ms = Date.now() - tStart;
    try {
      sendMessage({
        chatId,
        senderId: bot.id,
        type: 'text',
        body,
        extra,
      });
    } catch (err) {
      logger.error(`bot ${bot.username} sendMessage failed`, { err: err?.message });
    }
    // Após persistir o bubble, manda evento limpando o stream daquele índice
    // (front vai substituir o ghost pelo message.new que já chegou).
    publish(getRecipientIds(chatId, bot.id), {
      type: 'bot.stream.end',
      chat_id: chatId,
      user_id: bot.id,
      bubble_idx: bubbleIdx,
    });
    bubbleIdx++;
    bubbleBuf = '';
    bubbleStart = Date.now();
    lastStreamLen = 0;
  };

  try {
    const persona = getBotByUsername(bot.username);
    const messages = buildOllamaMessages(bot, chatId, persona?.few_shot || []);

    await ollamaChatStream({
      model: bot.bot_model,
      messages,
      temperature: bot.bot_temperature ?? 0.8,
      maxTokens: bot.bot_max_tokens ?? 256,
      signal: abortCtrl.signal,
      onDelta: (delta) => {
        // No primeiro token, troca o indicador de "pensando" para "escrevendo"
        // (publish typing.start com thinking:false) — UX dá o feedback de que
        // o bot saiu do "thinking" e está produzindo.
        if (!firstTokenSeen) {
          firstTokenSeen = true;
          publishWriting(chatId, bot);
        }

        bubbleBuf += delta;

        // Detecta corte de bubble: `\n\n` (preferencial), ou tamanho excessivo
        // forçando split em pontuação no fim de uma sentença.
        let cut = bubbleBuf.indexOf('\n\n');
        if (cut < 0 && bubbleBuf.length > MAX_BUBBLE_CHARS) {
          // Tenta cortar no fim de uma sentença (último ". " antes do limite)
          const slice = bubbleBuf.slice(0, MAX_BUBBLE_CHARS);
          const sentenceCut = Math.max(
            slice.lastIndexOf('. '),
            slice.lastIndexOf('! '),
            slice.lastIndexOf('? '),
          );
          if (sentenceCut > 100) cut = sentenceCut + 1; // +1 inclui o '.'
        }

        if (cut >= 0 && bubbleIdx < MAX_BUBBLES - 1) {
          // Flusha o trecho antes do corte. O resto fica no buf para
          // virar o próximo bubble (ou continuar acumulando).
          const before = bubbleBuf.slice(0, cut);
          const after = bubbleBuf.slice(cut).replace(/^\n+/, '');
          bubbleBuf = before;
          flushBubble(false);
          bubbleBuf = after;
          // Antes do próximo bubble, ressinaliza typing (sem thinking).
          publishWriting(chatId, bot, 30_000);
          if (after) publishStream(true);
        } else {
          publishStream(false);
        }
      },
    });
  } catch (err) {
    publishTypingStop(chatId, bot);
    inFlight.delete(chatId);
    const aborted = abortCtrl.signal.aborted;
    if (aborted) {
      // Usuário cancelou. Persistimos o que já tinha sido gerado (se algo)
      // com flag `bot_cancelled=true` pra UI marcar visualmente. Se nada
      // chegou, só não persiste nada — o lock no front cai via typing.stop.
      if (bubbleBuf.trim()) {
        try {
          sendMessage({
            chatId,
            senderId: bot.id,
            type: 'text',
            body: bubbleBuf.trim(),
            extra: { bot: true, bot_reply_ms: Date.now() - bubbleStart, bot_total_ms: Date.now() - tStart, bot_cancelled: true, bot_bubble_idx: bubbleIdx },
          });
        } catch { /* noop */ }
      }
      logger.warn(`bot ${bot.username} reply aborted by user`, { chatId, elapsedMs: Date.now() - tStart });
      return;
    }
    logger.error(`bot ${bot.username} ollama call failed`, { err: err?.message, model: bot.bot_model });
    try {
      sendMessage({
        chatId,
        senderId: bot.id,
        type: 'text',
        body: '[modelo offline no momento — tenta de novo daqui a pouco]',
        extra: { bot: true, bot_reply_ms: Date.now() - tStart, bot_total_ms: Date.now() - tStart, bot_error: true },
      });
    } catch { /* noop */ }
    return;
  }
  // Stream finalizou normalmente — remove do mapa de in-flight.
  inFlight.delete(chatId);

  // Stream encerrado. Persiste o último bubble (com bot_total_ms).
  if (bubbleBuf.trim()) {
    flushBubble(true);
  } else if (bubbleIdx === 0) {
    // Stream terminou e nada foi gerado — bot ficou em silêncio. Manda fallback.
    try {
      sendMessage({
        chatId,
        senderId: bot.id,
        type: 'text',
        body: '...',
        extra: { bot: true, bot_reply_ms: Date.now() - tStart, bot_total_ms: Date.now() - tStart, bot_empty: true },
      });
    } catch { /* noop */ }
  }
  publishTypingStop(chatId, bot);
}

function getRecipientIds(chatId, excludeUserId) {
  return getDb()
    .prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ? AND left_at IS NULL')
    .all(chatId, excludeUserId)
    .map((r) => r.user_id);
}

/**
 * 3 estados visíveis no front:
 *   - "pensando…"   (typing.start, thinking=true)   — antes do 1º token
 *   - "escrevendo…" (typing.start, thinking=false)  — token streaming
 *   - sem indicador (typing.stop)                    — fim
 *
 * Helpers dedicados pra não confundir flags.
 */
function publishThinking(chatId, bot, ttlMs = 90_000) {
  emitTyping(chatId, bot, 'typing.start', { thinking: true, ttl_ms: ttlMs });
}
function publishWriting(chatId, bot, ttlMs = 60_000) {
  emitTyping(chatId, bot, 'typing.start', { thinking: false, ttl_ms: ttlMs });
}
function publishTypingStop(chatId, bot) {
  emitTyping(chatId, bot, 'typing.stop', { thinking: false, ttl_ms: 0 });
}

function emitTyping(chatId, bot, type, extra) {
  const recipients = getRecipientIds(chatId, bot.id);
  if (!recipients.length) return;
  publish(recipients, {
    type,
    chat_id: chatId,
    user_id: bot.id,
    user_name: bot.name || bot.username,
    ...extra,
  });
}

export function listBotsPublic() {
  return getDb()
    .prepare(
      `SELECT id, username, name, bio, avatar_path, bot_model, bot_tagline, bot_vision
       FROM users
       WHERE is_bot = 1 AND status = 'active'
       ORDER BY name COLLATE NOCASE`
    )
    .all();
}
