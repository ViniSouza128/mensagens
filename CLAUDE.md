# CLAUDE.md

> Anotações pro Claude (eu ou outro modelo) que abrir este projeto no futuro.

## Contexto do usuário (Vini)

- **Não é dev.** Tem noções básicas — usa Claude Code pra tocar o projeto inteiro. Quando ele descreve um bug ou pede uma feature, **entenda em código** o que ele quer (ele não vai detalhar trade-offs técnicos).
- **Comunica em português brasileiro coloquial.** Misturado com gírias, abreviações ("vc", "n", "msg", "ia"), digita rápido. Não corrige por isso — só responda em pt-br também.
- **Quer tudo implementado de uma vez.** Ele não gosta de "vou começar pela parte A e depois você confirma pra eu continuar". Lê o pedido inteiro, faz tudo, comita, sobe pro GitHub, reporta no fim.
- **Espera verificação.** Sempre testar no preview (`mensagens-dev`) depois de fazer mudança grande, especialmente UX. Mostrar evidência (snapshot da UI, resultado de fetch, etc).
- **Quer documentação + comentários inline.** A cada mudança, atualizar README/DECISIONS/ROADMAP se for arquitetural, e comentar pesadamente o código novo explicando o "por quê" — não só o "o quê".
- **Aceita decisões técnicas suas.** "vc decide" quando não tem preferência. Use bom-senso e justifique no commit.

## Workflow padrão

1. Ler o pedido inteiro com atenção. Identificar TODAS as coisas pedidas.
2. Plan numa todo list visível (`TodoWrite`).
3. Implementar em ordem (geralmente: fixes pequenos → features médias → features grandes → docs).
4. Verificar no browser preview (`mcp__Claude_Preview__*`).
5. Comitar com mensagem detalhada (HEREDOC, várias linhas, explicando o porquê de cada mudança).
6. `git push` pro GitHub (`ViniSouza128/mensagens`).
7. Reportar tudo no chat com resumo e exemplos.

## Stack do projeto

- **Next.js 15 (App Router)** + **React 19** + **JavaScript puro** (sem TypeScript — pedido dele).
- **CSS Modules** (sem Tailwind, sem CSS-in-JS).
- **SQLite via better-sqlite3** com **FTS5** pra busca. Schema em `src/database/schema.sql`, migrações idempotentes em `src/database/db.js#runMigrations`.
- **JWT em cookie httpOnly** (jose) + sessões em tabela.
- **SSE** pro realtime (não WebSocket).
- **Sharp** pra processamento de imagens (thumbs, posters de vídeo).
- **Ollama local** em `127.0.0.1:11434` pra bots LLM (feature opcional).

## Hardware do usuário

- **GPU: RTX 4080 16 GB VRAM** — limite pra modelos que cabem inteiros.
- Modelos > 16 GB rodam com offload pra CPU (lentos mas funcionam).
- `ollama list` na conta dele tem variedade grande; quando ele pedir bot novo, escolha modelo que já está instalado (peça `ollama pull` só se realmente precisa).

## Bots LLM

Veja `docs/AGENTS.md` pra detalhes de cada persona. Pontos chave:

- Personas em `src/server/llm/personas.js` (array `BOTS`).
- Cada bot é um usuário real (is_bot=1) — reaproveita TODO o fluxo de chat normal.
- Seed (`npm run seed`) faz upsert idempotente E DELETE de bots removidos do array.
- Streaming via `ollamaChatStream` (`src/server/llm/ollama.js`), multi-bubble split on-the-fly em `\n\n`.
- Sempre setar `think: false` (modelos Qwen3 são "thinking" — sem isso devolvem content vazio).
- Sanitizar histórico contra identity leaks ("I am Gemma", etc) — regex em `bots.js#IDENTITY_LEAK_PATTERNS`.
- Few-shot é mais forte que system prompt pra modelos pequenos. Sempre incluir 3-5 turnos exemplo.
- 3 estados visíveis de "está digitando": `publishThinking` (pensando), `publishWriting` (escrevendo, durante streaming), `publishTypingStop`.
- Composer fica **locked** enquanto bot responde — banner "Aurora está escrevendo… 2.3s [parar]". NÃO enfileira: força clique ativo de novo.

### Bot de visão (Vera)

- Modelo `qwen3-vl:8b`. Flag `vision: true` na persona → coluna `users.bot_vision`.
- Composer libera anexo de imagem só pra vision bots (`attachMode = 'image-only'`).
- Pipeline: imagem é uploadada normalmente; quando o bot vai responder, `loadImagesAsBase64()` em `bots.js` lê do disco e injeta no campo `images` do turno user no payload Ollama.
- Limite: 3 imagens / 5 MB cada por turno (modelos vision sofrem com mais).

## Convenções importantes

### "Limpar conversa" (POST `/api/chats/[id]/clear`)
Apaga TODAS as mensagens do chat globalmente. Pra chats com bot, equivale a "começar de novo" (sem memória). Publica SSE `chat.cleared` que:
- AppStateProvider zera `last_message` da chat na lista lateral.
- ChatView esvazia `messages`, limpa `localStorage` cache, dispara `loadChat()`.
- localStorage `mensagens.cache.msgs.<chatId>` é removido pra reabrir o chat não restaurar.

### "Apagar para mim" (DELETE `/api/messages/[id]?scope=me`)
Insere linha em `message_hides`. listMessages filtra com NOT EXISTS. Não publica SSE (só afeta o usuário atual). Diferente de DELETE `?scope=everyone` (marca msg.deleted=1, publica SSE).

### Bulk delete/forward
Selection mode no chat header. Apagar bulk usa `DELETE /api/messages/<id>?scope=me` em paralelo. Encaminhar bulk passa o array via `ForwardModal` → `POST /api/messages/forward` (já existia).

### Cancel mid-response (POST `/api/chats/[id]/bot-abort`)
Mata o stream Ollama via `AbortController`. Conteúdo já gerado é persistido com `bot_cancelled: true` no extra. Front mostra botão "parar" no lock banner com ElapsedTimer (atualiza a cada 250ms).

## Coisas que NÃO mexer sem pedir

- **TypeScript** — usuário pediu explicitamente JS puro.
- **CSS frameworks** — sem Tailwind, Bootstrap, etc.
- **ORM** — SQL puro com prepare(). Adicionar Prisma/Drizzle = NÃO.
- **WebSocket** — SSE atende; não trocar sem motivo forte.
- **Auth strategy** — JWT em httpOnly cookie tá decidido.

## Coisas que ele NÃO sabe (cuide pra ele)

- Conceitos avançados de SQL (joins complexos, índices, deadlocks).
- Detalhes de React (memo, refs, fast-refresh, hooks vs class).
- HMR/cache stuff (quando "não atualiza" geralmente é cache do browser ou React memo).
- Ollama internals (think mode, streaming, num_ctx, etc).

Quando algo "não funciona pra ele", normalmente é:
1. **Cache do browser** — faça hard reload + service worker unregister.
2. **HMR não pegou a mudança** — `touch` no arquivo ou kill+restart do dev server.
3. **Modelo cold** — primeira chamada Ollama pra um modelo carrega ele na VRAM (~5-30s); depois fica rápido.
4. **Algum effect React tá com dep errada** — repensar o useEffect.

## Tunnel

- Quick tunnel Cloudflare (`cloudflared tunnel --url http://localhost:3000`) tem URL **aleatória por sessão**. Não tem como manter a mesma URL "X" — quando o processo morre, a URL morre.
- Se ele insistir na URL antiga, explica que não dá. Sugira:
  - Named tunnel (precisa domínio próprio na conta dele) — URL estável.
  - ngrok com plano pago (URL fixa).
- Antes de qualquer push final, **verificar `tail H:/Programas/mensagens/logs/tunnel.log`** ou rodar `curl -sL https://<url>` pra confirmar que tá no ar.

## Convenções de UI

- **Idioma todo em pt-br.** Textos pra usuário em português; comentários no código TAMBÉM em pt-br (ele lê o código pra entender).
- **CSS Modules**: cada componente tem seu `.module.css`. Não inventar `.classnames` no JSX sem entrada no module.
- **Sem emoji em código** a menos que ele peça. Em UI textos é OK quando combina com tom (ex.: Aurora pode mandar "😊" em mensagem de chat, mas botão "Enviar" não tem emoji).
- **Avatares**: Avatar.js. `src={path}` aceita "http..." ou caminho relativo (vira `/api/files/<path>`). `fetchPriority` camelCase (React 19).

## Arquivos críticos pra entender o sistema

1. `src/server/handlers/messages.js` — fluxo de mensagens (sendMessage, deleteMessage, hideMessageForUser, listMessages, buildMessage).
2. `src/server/llm/bots.js` — orquestrador dos bots (streaming, multi-bubble, timing, abort).
3. `src/server/events.js` — pub/sub SSE in-memory.
4. `src/store/AppStateProvider.js` — estado global do client (chats, SSE listener, typing preview).
5. `src/components/chat/ChatView.js` — orchestrator do chat aberto (send, SSE handlers, lock, streaming preview).
6. `src/components/chat/MessageBubble.js` — render de cada bolha.
7. `src/database/schema.sql` + `src/database/db.js` — schema + migrações.

## Como adicionar feature nova

1. Pensar onde mora — backend (handler), endpoint (`/api/...`), front (componente), schema (se persistir).
2. Migração idempotente em `db.js#runMigrations` se mexer schema.
3. Code com comentários explicando o porquê.
4. Atualizar `docs/AGENTS.md` se for bot, ou seção relevante no README/DECISIONS/ROADMAP.
5. Verificar no preview.
6. Commit + push.

Boa sorte. — Claude anterior.
