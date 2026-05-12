# Mensagens

Mensageiro web moderno, completo e escalável construído com **Next.js 14 (App Router)**, **React 18**, **JavaScript puro** (sem TypeScript), **CSS Modules** e **SQLite** (via `better-sqlite3` com FTS5). Roda inteiramente em uma única instalação local — sem dependências de terceiros em runtime.

## Recursos principais

- **Autenticação completa** — registro, login, onboarding, sessões persistentes em cookies httpOnly assinados (JWT via `jose`), bcrypt para senhas.
- **Layout responsivo** — sidebar fixa no desktop, navegação adaptada no mobile, temas claro/escuro/automático com 7 cores de destaque e 3 tamanhos de fonte.
- **Conversas privadas** com indicadores de status (enviando, enviado, entregue, lido, falhou) e fila de retry para mensagens com falha.
- **Modelo social** — contatos (desconhecido / adicionado / bloqueado / mútuo derivado automaticamente), bloqueio de mensagens de desconhecidos com solicitação discreta de contato.
- **Mídias** — fotos, vídeos, áudios, documentos e GIFs animados, com geração de thumbs/poster (Sharp), reduções automáticas (1600px otimizado / 2560px HD), pré-visualização antes do envio com legenda, rotação e toggle HD.
- **Upload local** — fotos até 80 MB, vídeos até 320 MB, documentos até 2 GB; drag-and-drop, paste, seleção pelo botão; proteção contra path traversal.
- **Mensagens completas** — texto, timestamps, reply, copy, reagir, encaminhar (uma ou várias), favoritar, fixar, apagar, editar dentro de 4h ou enquanto não lida, histórico de edições, expansão "ver mais".
- **Detecção de links em tempo real** com prévia discreta (Open Graph) e proteção SSRF contra IPs privados/loopback.
- **Lista de chats** com fixados, arquivados, mute, contagem de não lidas, rascunho persistente, ordenação por última mensagem.
- **Busca global** com SQLite FTS5 (`unicode61 remove_diacritics 2`) — usuários, chats, mensagens (com `<mark>`) e arquivos, sem distinção de acentos/maiúsculas.
- **Configurações** — privacidade (visto/foto/bio: todos/contatos/ninguém), notificações, tema/cor/fonte/papel de parede, qualidade de mídia, auto-download, enviar com Enter.
- **Painel administrativo** (visível apenas para admins) — visão geral, usuários (buscar, promover, suspender, banir, reintegrar), denúncias com contexto **15 anteriores + 5 posteriores** ao alvo, log de auditoria, log de erros.
- **Bots LLM locais (Ollama) com streaming** — 5 usuários-bot com personas distintas (`Zezé`, `Mara`, `Hermes`, `Aurora`, `Clarice`) que respondem em tempo real usando modelos rodando em `127.0.0.1:11434`. Tokens chegam ao vivo via SSE (`bot.stream`) e aparecem letra-por-letra num "ghost bubble" antes de virarem mensagens reais — mesma sensação que o ChatGPT. Indicador troca entre **"pensando…"** (antes do 1º token) e **"escrevendo…"** (durante streaming). Respostas longas viram múltiplos balões separados, cada um com **tempo por balão** + **total** ao fim. Composer fica **bloqueado** enquanto o bot termina a resposta — não enfileira, exige clique ativo. **"Limpar conversa"** apaga histórico e (para bots) reseta a janela de contexto. Personas, prompts e modelos vivem em `src/server/llm/personas.js`; foto de perfil baixada do DiceBear pelo seed.
- **Performance** — virtualização leve, infinite scroll, lazy loading, UI otimista, EventSource (SSE) para realtime.
- **Acessibilidade** — navegação por teclado, foco visível, rótulos ARIA em todos os controles, contraste adequado nos dois temas.
- **PWA base** — manifesto, ícones SVG vetoriais, theme-color por modo.
- **Auditoria completa** — toda ação sensível de admin é registrada com ator, alvo e metadados.

## Pré-requisitos

- **Node.js 18.18+** (testado com 18 e 20)
- Sistema com permissão para compilar `better-sqlite3` (no Windows requer `windows-build-tools` ou Visual Studio Build Tools)

## Instalação e execução

```bash
npm install
npm run dev
```

O `prepare.mjs` (executado automaticamente no `dev` e `build`) cria as pastas `data/` e `uploads/`. **Na primeira execução**, quando o banco ainda não existe, ele roda o seed automaticamente — criando o esquema e os usuários iniciais. Nas execuções seguintes o banco já existe e o seed é ignorado.

Acesse <http://localhost:3000>.

## Credenciais padrão (seed)

| Conta  | Usuário | Senha       | Papel |
|--------|---------|-------------|-------|
| Admin  | `admin` | `admin123`  | Administrador |
| Ana    | `ana`   | `ana12345`  | Usuário comum |
| Bruno  | `bruno` | `bruno12345`| Usuário comum |
| Clara  | `clara` | `clara12345`| Usuário comum |

Você pode sobrescrever a conta admin antes do primeiro `npm run dev` definindo as variáveis `ADMIN_USERNAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

> **Produção:** O servidor **não sobe** se `AUTH_SECRET` for o valor padrão (`NODE_ENV=production`). Defina uma string aleatória longa via variável de ambiente. A senha padrão do admin (`admin123`) também deve ser trocada antes de expor o serviço publicamente.

## Bots LLM (Ollama local)

O seed cria 5 usuários-bot que respondem automaticamente quando alguém manda DM para eles. Para que respondam de verdade, você precisa do **Ollama** rodando localmente (`ollama serve`) e dos modelos baixados (`ollama pull <nome>`).

| Bot       | Modelo                                            | Estilo                          | VRAM aprox. |
|-----------|---------------------------------------------------|---------------------------------|-------------|
| Zezé      | `gemma3:270m`                                     | Adolescente gen-z casual         | ~0.3 GB |
| Mara      | `jaahas/qwen3.5-uncensored:4b`                    | Amiga sarcástica sem filtro     | ~3.5 GB |
| Hermes    | `igorls/gemma-4-E4B-it-heretic-GGUF:q4_k_m`       | Filósofo provocador (uncensored) | ~5 GB |
| Aurora    | `mistral-small3.2:24b`                            | Assistente equilibrada           | ~15 GB |
| Clarice   | `command-r:35b`                                   | Escritora — texto, prosa, poesia (lenta) | ~18 GB (offload p/ CPU se >VRAM) |

Todos os bots têm regras rígidas no system prompt para **sempre responder em pt-br** (exceto se o usuário pedir outro idioma explicitamente). Cada turno é cronometrado: o front mostra **`1.4s`** à esquerda do horário em cada balão e uma badge adicional **`total 6.0s`** no último balão da resposta.

Encontre os bots em **Nova conversa → seção "Bots AI (Ollama local)"**, ou apenas busque pelo nome. Cada bot é um usuário real do sistema: você pode reagir, fixar, encaminhar suas mensagens normalmente.

Variáveis de ambiente:

- `OLLAMA_HOST` — base URL (default `http://127.0.0.1:11434`)
- `OLLAMA_TIMEOUT_MS` — timeout por chamada (default 180000, suficiente para qwen3-coder)

Para criar/ajustar bots: edite o array `BOTS` em [`src/server/llm/personas.js`](src/server/llm/personas.js) e rode `npm run seed` — o upsert atualiza modelo/prompt/temperatura sem perder mensagens. Veja a seção "Bots LLM" em [DECISIONS.md](./DECISIONS.md) para o racional completo.

## Scripts

| Comando            | Descrição                                                |
|--------------------|----------------------------------------------------------|
| `npm run dev`      | Inicia o servidor Next.js em modo desenvolvimento        |
| `npm run build`    | Compila para produção                                    |
| `npm start`        | Roda a build de produção                                 |
| `npm run lint`     | Executa o ESLint                                         |
| `npm run migrate`  | Aplica o schema SQL no banco                             |
| `npm run seed`     | (Re)cria as contas iniciais                              |

## Estrutura

```
src/
├── app/
│   ├── (auth)/                # login, register, onboarding (layout pública)
│   ├── (app)/                 # rotas autenticadas (layout protegido)
│   │   ├── chats/             # lista + thread por id
│   │   ├── contacts/          # contatos, adicionar, bloqueados
│   │   ├── search/            # busca global
│   │   ├── archived/          # conversas arquivadas
│   │   ├── requests/          # solicitações de contato
│   │   ├── profile/           # perfil próprio e alheio
│   │   ├── settings/          # 6 abas (Conta, Privacidade, …)
│   │   ├── feedback/          # canal direto com a equipe
│   │   └── admin/             # dashboard administrativo (admins)
│   └── api/                   # route handlers (Next.js)
├── components/                # UI primitives + componentes de domínio
├── server/                    # auth, http, eventos SSE, audit, search, uploads
│   └── llm/                   # cliente Ollama + orquestrador de bots + personas
├── database/                  # conexão e schema do better-sqlite3
├── services/api.js            # cliente fetch tipado
├── store/                     # provider de estado global (chats, requests, SSE)
└── hooks/                     # hooks utilitários (debounce, media query)
data/                          # banco SQLite (criado em runtime)
uploads/                       # arquivos enviados (criado em runtime)
public/                        # manifest, favicon, ícones
```

## Documentos relacionados

- [DECISIONS.md](./DECISIONS.md) — escolhas arquiteturais e o porquê.
- [ROADMAP.md](./ROADMAP.md) — próximos passos previstos.
