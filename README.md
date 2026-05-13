# Mensagens

Mensageiro web moderno e completo construído com **Next.js 15 (App Router)**, **React 19**, **JavaScript puro** (sem TypeScript), **CSS Modules** e **SQLite** (via `better-sqlite3` com FTS5). Roda inteiramente em uma única instalação local — sem dependências de terceiros em runtime.

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
- **Painel administrativo** (visível apenas para admins) — visão geral, usuários (buscar, promover, suspender, banir, reintegrar), denúncias com contexto **15 anteriores + 5 posteriores** ao alvo, leitura administrativa auditada em `/admin/spy`, log de auditoria, log de erros.
- **Performance** — virtualização leve, infinite scroll, lazy loading, UI otimista, EventSource (SSE) para realtime.
- **Limpar conversa** — apaga histórico do chat de todos os membros (cascata limpa mídias, reações, fixados); preview na lista lateral é atualizado em tempo real via SSE `chat.cleared`.
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

## Variáveis de ambiente

`MESSAGE_ENCRYPTION_KEY` é obrigatória. Ela é a chave mestra AES-256-GCM usada para cifrar `messages.body`, campos sensíveis de `messages.extra` e `message_edits.body_before` antes de gravar no SQLite.

Gere uma chave local com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Depois coloque em `.env.local`:

```bash
MESSAGE_ENCRYPTION_KEY=cole-a-chave-gerada-aqui
```

⚠️ Guarde essa chave fora do projeto. Se ela for perdida, mensagens já cifradas não podem ser recuperadas.

## Extras opcionais

### Bots LLM via Ollama

O seed também cria alguns usuários-bot que respondem via [Ollama](https://ollama.com/) local — útil para teste e demo offline. Não é o foco do projeto; é só um "tempero" que aproveita a arquitetura de chat existente. Se você não quiser, basta remover os bots do array `BOTS` em [`src/server/llm/personas.js`](src/server/llm/personas.js) e rodar `npm run seed`. Sem Ollama rodando, os bots aparecem na lista mas mostram "[modelo offline]" ao receber mensagem.

Personas, modelos e detalhes técnicos: [docs/AGENTS.md](docs/AGENTS.md).

Variáveis relacionadas:

- `OLLAMA_HOST` — base URL (default `http://127.0.0.1:11434`)
- `OLLAMA_TIMEOUT_MS` — timeout por chamada (default 180000)

## Scripts

| Comando            | Descrição                                                |
|--------------------|----------------------------------------------------------|
| `npm run dev`      | Inicia o servidor Next.js em modo desenvolvimento        |
| `npm run build`    | Compila para produção                                    |
| `npm start`        | Roda a build de produção                                 |
| `npm run lint`     | Executa o ESLint                                         |
| `npm run migrate`  | Aplica o schema SQL no banco                             |
| `npm run seed`     | (Re)cria as contas iniciais                              |
| `npm run encrypt-existing` | Cifra mensagens antigas e reconstrói a FTS plaintext controlada |

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
