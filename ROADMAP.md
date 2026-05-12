# Roadmap

Itens previstos para próximas iterações, agrupados por tema. Tudo aqui é incremento — o produto atual já cobre o escopo do MVP descrito no [README.md](./README.md).

## Curto prazo (próximas semanas)

### Grupos
- UI completa de criação, edição e administração de grupos. A base de dados (chats `type='group'`, `chat_members`, papéis) já existe; falta a camada visual.
- Convites por link com expiração.
- Permissões por papel (admin/moderador/membro): quem pode adicionar, remover, fixar mensagens, alterar título/foto.

### Notificações
- Web Push (Notification API + Service Worker) com `VAPID`. O manifesto e os ícones já estão prontos — basta registrar o SW e adicionar a tabela `push_subscriptions`.
- Sons configuráveis e respeito ao `notify_groups`/`notify_messages` por categoria.

### Mensagens de voz
- Gravação direta no Composer com `MediaRecorder` (WebM/Opus).
- Waveform pré-calculada no servidor (via FFmpeg opcional).
- Reprodução acelerada (1×/1.5×/2×).

### Chamadas
- Áudio/vídeo 1:1 via WebRTC com sinalização sobre o canal SSE atual + endpoints `/api/calls/*`.
- Histórico de chamadas no thread (mensagem do tipo `call`).

### Bots LLM (Ollama)

A versão atual já entrega 5 personas com modelos diversos (Zezé / Mara / Hermes / Aurora / Doc Byte). Próximos passos previstos:

- **Streaming de tokens** — trocar `/api/chat` (não-streaming) por streaming, retransmitindo deltas via SSE. Daria efeito "letra por letra" em vez de só "está pensando…". Trade-off: complexidade no orquestrador (chunk-buffering por sentença) e mais eventos no fanout.
- **Memória persistente por bot** — hoje cada turno relê as últimas 20 mensagens do chat (`CONTEXT_WINDOW` em `bots.js`). Para conversas longas, treinar um resumidor rotativo (a cada N mensagens, resume em uma `system` injectável) ou usar `/api/embeddings` do Ollama + RAG sobre o histórico.
- **Cancelamento explícito** — se o usuário envia uma 2ª mensagem antes do bot terminar de responder, abortar o request Ollama em andamento e re-prompt com o novo turno. Já temos `AbortSignal` no cliente Ollama; falta o tracking por chat.
- **Painel admin** — CRUD de bots (criar/editar persona, model, temperature) via UI em vez de só `personas.js`. Útil quando outros admins quiserem variantes sem mexer no código.
- **Vision bots** — segunda categoria de bot que aceita anexo de imagem e usa modelos vision-instructed (`llava:7b`, `qwen2.5vl:7b`, etc). Requer roteamento no orquestrador para detectar `attachments[0].kind === 'image'`.
- **Tool use / function calling** — bots que executam ações: buscar na web, criar lembrete, ler outras mensagens do chat. Precisa de uma camada de autorização (qual bot pode fazer o quê) e auditoria reforçada.
- **Rate limit por bot** — hoje só o humano tem rate limit (60 msg/min). Se um bot delirar e mandar 30 chunks, atrapalha. Capar `MAX_CHUNKS` e adicionar circuit-breaker por bot.

## Médio prazo

### Criptografia ponto-a-ponto
- Iniciar com handshake X3DH-like e double ratchet apenas para chats diretos.
- Manter pareamento de dispositivo via QR code.
- Mensagens já criptografadas seriam armazenadas como blob; servidor permaneceria autoridade de entrega/ordenação mas sem ler conteúdo.

### Multi-dispositivo
- Sessões nomeadas em `sessions` já permitem múltiplos logins; falta a UX de "dispositivos vinculados" e revogação granular.
- Sincronização incremental por `updated_at` cursor.

### Backup e exportação
- Exportar conversa em JSON + arquivos zipados.
- Importar JSON criando mensagens com `forwarded_from_id` apontando para o original (para preservar contexto).

### Stickers e GIFs
- Provedor local primeiro; integração opcional com Tenor/Giphy via chave configurável.
- Pacotes de stickers personalizados via upload.

## Longo prazo

### Federação
- Avaliar ActivityPub para interop básica entre instâncias Mensagens (perfis públicos, mensagens diretas opt-in).

### Plugins
- API para extensões locais de bot/comando, com sandbox (Web Worker isolado).

### Observabilidade
- Métricas Prometheus opcionais expostas em `/api/metrics` (atrás de auth admin).
- Dashboard de SLO interno (P95 envio, fila de retry, conexões SSE).

## Dívida técnica e melhorias contínuas

- **Testes**: cobertura de smoke (Playwright) para fluxos de auth, envio, edição, denúncia e moderação.
- **Migrações versionadas**: hoje o `migrate.mjs` é idempotente; passar para arquivos numerados (`001_*.sql`, `002_*.sql`).
- **Rate limiting persistente**: hoje as janelas vivem em memória; mover para tabela quando rodar com múltiplas instâncias.
- **Internacionalização**: extrair strings para `messages/pt-BR.json` e adicionar `en-US`.
- **Acessibilidade**: auditoria com axe-core e correção de qualquer rótulo faltante.
- **Reduce motion**: respeitar `prefers-reduced-motion` em transições de modal/drawer.
