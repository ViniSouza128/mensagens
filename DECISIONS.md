# Decisões de arquitetura

Resumo das principais escolhas técnicas e o porquê de cada uma.

## Stack

- **Next.js 14 (App Router)** — server components para layouts/proteção de rota e route handlers em `app/api/*` para a API. Mantém front e back num único processo, simplifica deploy e dispensa BFF separado.
- **JavaScript puro (sem TypeScript)** — pedido explícito do projeto. Compensamos com lint estrito, contratos claros nos handlers e validações servidor-side em `server/validations.js`.
- **CSS Modules + tokens via custom properties** — cada componente tem seu `.module.css` evitando colisões; tema/cor/fonte são controlados pelos atributos `data-theme`/`data-accent`/`data-font` no `<html>` e resolvem para variáveis CSS em `globals.css`. Sem CSS-in-JS para evitar runtime extra.
- **SQLite via `better-sqlite3`** — banco embarcado, sem servidor extra. Migrações simples e suficientes para o escopo. FTS5 com `unicode61 remove_diacritics 2` resolve busca acento-insensível e fuzzy-ready sem dependências adicionais.

## Realtime

- **Server-Sent Events (SSE)** em vez de WebSocket. Razões:
  - Roda em qualquer plataforma de hospedagem que suporte streaming HTTP.
  - Reconexão automática nativa do `EventSource`.
  - Suficiente para fluxo unidirecional servidor→cliente; mensagens enviadas via POST normal.
- Conexões SSE são contadas em `server/events.js` (`activeCount`) e expostas no painel admin.

## Autenticação

- **JWT em cookie httpOnly** assinado via `jose`, com tabela `sessions` espelho para revogação.
- Senhas com **bcryptjs** (custo 10) — pure JS, sem dependências nativas extras.
- Middleware/handlers usam `requireUser()` / `requireAdmin()` que lêem o cookie e validam a sessão.

## UX de mensagens

- **UI otimista**: ao enviar, criamos uma mensagem `tmp_<client_id>` no estado e fazemos POST. Ao receber a confirmação (resposta direta ou eco do SSE) substituímos pela versão server pelo `client_id`. Falhas marcam `status: 'failed'` e mostram retry.
- **Edição** permitida em até 4h após o envio **OU** enquanto a mensagem ainda não foi lida pelo destinatário — quem fica sem ler aceita ediç ões mais antigas naturalmente.
- **Status** (`sending` → `sent` → `delivered` → `read`) é derivado dos `message_receipts` no servidor; o cliente apenas renderiza.
- **Pin/Star/Reply/Forward/React** são endpoints idempotentes; o estado fica no banco para sobreviver a recarregamentos.

## Modelo social

- Bloqueio de mensagens de desconhecidos (`block_unknown`) faz com que mensagens de não-contatos virem **solicitação de contato** discreta — o destinatário aceita/rejeita; o remetente não sabe se foi bloqueado.
- Estado mútuo (`mutual`) é derivado on-the-fly da existência de relação A→B e B→A; não existe tabela duplicada.

## Mídia

- **Sharp** para todas as transformações em imagens. Fluxo: upload → kindHint → se imagem, gera thumb 220px + variante padrão 1600px (ou 2560px com `hd: '1'`) → grava metadados. Vídeos têm extração de poster pela primeira frame.
- Arquivos servidos por `app/api/files/[...path]/route.js` com `resolveUploadPath` que valida e impede traversal.
- Limites duros aplicados no servidor: 80 MB foto, 320 MB vídeo, 2 GB documento.

## Links

- Detecção de URL no cliente enquanto digita; preview chamada apenas na primeira URL.
- Endpoint `/api/linkpreview` valida com `isLikelyPrivateHost` para bloquear loopback/RFC1918/link-local — defesa SSRF.
- Cache em memória no cliente para evitar refetch ao re-renderizar.

## Admin

- **Princípio do menor privilégio**: admin **não** acessa chats privados arbitrariamente. A única visão de mensagens disponível é o **contexto de denúncia**: 15 mensagens anteriores + 5 posteriores ao alvo, e somente quando uma denúncia existe. Toda visualização de contexto fica no log de auditoria.
- Promover/suspender/banir/reintegrar passa pelo mesmo POST `/api/admin/users` com um campo `action` — fluxo mais simples no front e auditoria uniforme no back.

## Segurança

- Todas as escritas usam SQL parametrizado (`prepare(...).run(?)`).
- Rate limiting em janelas em memória (`server/rateLimit.js`) protege endpoints de envio de mensagens, login, registro e link preview.
- Cookies de sessão são `httpOnly`, `sameSite=lax` e `secure` em produção.
- Sem `dangerouslySetInnerHTML` em conteúdo do usuário, exceto em snippets de busca já sanitizados pelo servidor (apenas `<mark>`).

## Performance

- Listas longas usam `IntersectionObserver` para infinite scroll ao invés de virtualização agressiva — bom equilíbrio entre simplicidade e fluidez para o tamanho típico de chat.
- Imagens usam `loading="lazy"` por padrão.
- O cliente memoriza o último estado de scroll por chat para não pular ao voltar de outras telas.

## Fila FIFO global de bot replies

- **Por que:** GPU única (RTX 4080, 16 GB VRAM) só roda 1 modelo decente por vez. Antes (sem fila), múltiplas mensagens disparavam chamadas Ollama em paralelo — VRAM saturava, modelos competiam, qualidade despencava. Agora todas as respostas passam por uma FIFO global; worker único processa 1 job por vez.
- **Estado**: `queue` (array) + `inFlight` (map por chatId, com AbortController) + `running` boolean em [`bots.js`](src/server/llm/bots.js).
- **Fairness**: ordem de chegada. User A mandando 7 perguntas com user B intercalando 1 no meio → ambos respondidos na ordem que entraram na fila, sem priorização por user.
- **Anti-duplicata**: se um job pro mesmo `chatId` já está aguardando OU rodando quando entra novo, o anterior é abortado/removido. Caso típico: usuário mandou 2 mensagens rápidas — só a última precisa de resposta.
- **Cancel**: `abortBotReply(chatId)` cobre tanto job rodando (aborta stream Ollama) quanto na fila (remove + notifica typing.stop).
- **SSE pro front**: cada job enfileirado dispara `typing.start` (thinking=true) imediatamente — usuário vê "Bot está pensando…" mesmo aguardando vez. Quando há fila >0, evento `bot.queue.position` informa quantos têm na frente. Lock banner mostra "X na frente" em vez de "está pensando".
- **Trade-off rejeitado**: priorização por usuário. Seria mais "justo" pra evitar um user monopolizar, mas complica o modelo mental ("por que minha pergunta foi pulada?"). FIFO é previsível.

## Streaming + UX dos bots LLM

- **Streaming de tokens** (`ollamaChatStream` em `server/llm/ollama.js`) — POST com `stream:true` + `think:false`. O parser lê NDJSON token-a-token e dispara `onDelta(piece)` por chunk. O orquestrador acumula em `bubbleBuf` e publica eventos SSE `bot.stream` debounced em 80ms — agrupa rajadas curtas, mantém UX fluida sem inundar o socket. UI mantém um "ghost bubble" com cursor piscando que cresce em tempo real até virar mensagem real (via `bot.stream.end` + `message.new`).
- **Multi-bubble on the fly** — em vez de esperar a resposta inteira pra dividir em parágrafos, o orquestrador detecta `\n\n` (ou tamanho > 600 chars com corte em sentença) NO MEIO do stream. Quando acha um separador, faz flush do trecho como mensagem real e abre um novo bubble pro resto. Resultado: respostas longas chegam como **vários balões aparecendo em sequência**, cada um com seu próprio streaming.
- **3 estados de "está digitando"** (helpers dedicados em `bots.js`):
  - `publishThinking()` — typing.start, thinking=true — front: **"pensando…"** — antes do 1º token
  - `publishWriting()` — typing.start, thinking=false — front: **"escrevendo…"** — token streaming
  - `publishTypingStop()` — typing.stop — front esconde o indicador
  Helpers separados evitam ambiguidade: antes `thinking=false` significava "stop" E "escrevendo" — bug latente.
- **Cronometria por balão + total** — primeiro balão mede do início da chamada Ollama até a primeira quebra; balões seguintes medem do flush anterior. Último balão recebe `bot_total_ms` (soma absoluta do turno). Front renderiza `1.4s` antes do horário em cada balão e `total 6.0s` (badge mais forte) só no último. Útil pra ver onde o tempo foi gasto numa resposta multi-balão.
- **Bloqueio de input enquanto bot responde** — quando o partner é bot E está no array `typing` do front, o Composer entra em modo `locked`: banner explicativo aparece acima da barra ("Aurora está escrevendo… aguarde para enviar"), botão de envio fica `disabled` e o textarea muda o placeholder. **Não enfileira**: a decisão consciente é exigir clique ativo de novo, porque a resposta do bot pode mudar o que o humano quer falar. Texto digitado é preservado durante o lock.
- **Limpar conversa** (POST `/api/chats/[id]/clear`) — apaga todas as mensagens do chat (cascata SQL cuida de receipts/reactions/attachments/edits/stars). Para bots LLM, a janela de contexto vive no DB (orquestrador relê últimas N mensagens para montar o prompt) — sem mensagens = bot esquece tudo. Publica `chat.cleared` via SSE para todos os membros recarregarem.
- **Sanitização de histórico** — respostas antigas do bot que vazaram identidade técnica (`I am Gemma`, `meu nome é Qwen`, etc) são detectadas via regex e REMOVIDAS do contexto enviado ao Ollama, junto com a pergunta que as disparou. Sem isso, modelos pequenos viam o histórico polúido e continuavam respondendo errado mesmo com few-shot decente.
- **Foto de perfil clicável** — avatar no painel de informações vira botão; clique abre o `Lightbox` (mesmo componente das mídias) com zoom/swipe nativos. Bug pré-existente também corrigido: o drawer lia `chat.avatar` em vez de `chat.avatar_path`, ignorando o caminho correto.

## Bots LLM (Ollama)

- **Usuários-bot são usuários "de verdade"** (linha em `users` com `is_bot=1` e colunas `bot_model` / `bot_system_prompt` / `bot_temperature` / `bot_max_tokens` / `bot_tagline`). Vantagem: reutilizam todo o fluxo de mensageria — chat direct, SSE, status de leitura, reactions, pin, search — sem caminho paralelo. Custo: ocupam contagem na tabela `users` mas isso é irrelevante na escala alvo.
- **Hook é fire-and-forget no fim de `sendMessage()`** (`server/handlers/messages.js`). Quando o handler termina de inserir + publicar `message.new`, ele chama `maybeBotReply()` que decide se há um bot na outra ponta. Crucialmente **não** bloqueia o response HTTP do humano. Erros do Ollama são engolidos e logados — o usuário humano nunca recebe 500 por causa de bot.
- **Ollama local em `127.0.0.1:11434`** via `/api/chat`. Streaming desligado (`stream:false`) para simplicidade: o "indicador de pensamento" cobre a latência percebida via SSE em vez de streamar tokens. Trade-off consciente: respostas só aparecem inteiras, sem efeito "letra-por-letra" — em compensação evitamos tokenização parcial, retries de chunks e complexidade no orquestrador.
- **Múltiplas mensagens por resposta**: o orquestrador (`server/llm/bots.js`) divide a resposta da LLM em até 3 chunks. Estratégia de corte: respeita `\\n\\n` que o próprio modelo emite (instruído via system prompt), e se algum chunk for >400 chars parte em sentenças. Cada chunk é enviado como mensagem separada via `sendMessage()` com delay simulado (350ms + 18ms/char, máx 2.2s) — UX mais natural do que parágrafo bloco.
- **Indicador "está pensando" vs "digitando"**: reaproveita o evento SSE `typing.start` adicionando dois campos novos: `thinking: boolean` (rótulo no front: "pensando…" em vez de "digitando…") e `ttl_ms` (front mantém o indicador por esse tempo antes de auto-clear). TTL longo (90s) cobre modelos grandes (qwen3-coder:30b chega a 30-60s).
- **Bot não pode ser o gatilho de outro bot**: `maybeBotReply` checa `senderId` e aborta se o remetente também é bot — evita loops recursivos caso bots conversem entre si no futuro.
- **Senhas dos bots são aleatórias**: o seed gera uma string nanoid+bcrypt para satisfazer `password_hash NOT NULL`, mas o bot nunca faz login pelo cookie. Quem cria mensagem em nome dele é sempre o servidor.
- **Personas em código, não em DB de admin**: `src/server/llm/personas.js` é a fonte da verdade dos prompts. O seed faz upsert idempotente; rodar `npm run seed` propaga ajustes de prompt para o banco sem perder histórico de mensagens.
- **Escolha dos modelos** (RTX 4080 16 GB): diversifica espectro fast → slow:
  - `gemma3:270m` (Zezé) — adolescente gen-z, latência quase nula.
  - `jaahas/qwen3.5-uncensored:4b` (Mara) — amiga sem filtro, ainda rápido.
  - `igorls/gemma-4-E4B-it-heretic-GGUF:q4_k_m` (Otto) — polímata técnico, modelo "heretic" sem salvaguardas pra opinar livre.
  - `mistral-small3.2:24b` (Aurora) — assistente equilibrada, "ChatGPT genérico" dentro da VRAM.
  - `command-r:35b` (Clarice) — escritora, especializada em texto de qualidade (Cohere RAG-tuned).
  - `qwen3-vl:8b` (Vera) — vision rápida, ~3-10s por resposta.
  - `qwen3-vl:30b` (Íris) — padrão ouro multimodal (texto + visão), ~30-90s. Excede VRAM → offload CPU, mas qualidade superior em qualquer tarefa.
  - `jaahas/qwen3.5-uncensored:27b` (Caio) — sem filtro, direto, opinião forte; uncensored permite opinar em tabus sem disclaimer vazio.
  - `Agen/gemma-4-26B-A4B-it-uncensored-heretic` (Nina) — sem filtro, reflexiva, cruza áreas; heretic remove salvaguardas mantendo perfil articulado.

A divisão é por NICHO + ESCALA — quando o usuário quer qualidade máxima, escolhe Íris; quando quer velocidade, Zezé ou Mara; quando quer um especialista, vai num dos focados (Otto/Clarice/Vera); quando quer opinião sem filtro, Caio (direto) ou Nina (reflexiva).

## Por que não X?

- **WebSocket** — overkill; SSE cobre 100% dos casos e atravessa proxies hostis melhor.
- **ORM (Prisma/Drizzle)** — adicionaria runtime e build steps; SQL puro é mais transparente para o tamanho do schema.
- **Tailwind / Styled Components** — pedido foi CSS puro; design tokens via custom properties já dão consistência.
- **Redis para fanout** — uma única instância Node serve bem o público-alvo; `events.js` faz fanout em memória com baixíssimo overhead.
