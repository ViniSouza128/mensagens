-- Mensagens — esquema do banco de dados
-- SQLite 3 com FTS5 para busca textual.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  username_normalized TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  bio TEXT DEFAULT '',
  avatar_path TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- active | suspended | banned
  status_until INTEGER,                  -- epoch ms (para suspensões temporárias)
  privacy_last_seen TEXT NOT NULL DEFAULT 'everyone',  -- everyone | contacts | nobody
  privacy_avatar TEXT NOT NULL DEFAULT 'everyone',
  privacy_bio TEXT NOT NULL DEFAULT 'everyone',
  read_receipts INTEGER NOT NULL DEFAULT 1,
  block_unknown INTEGER NOT NULL DEFAULT 0,
  notify_messages INTEGER NOT NULL DEFAULT 1,
  notify_groups INTEGER NOT NULL DEFAULT 1,
  sound_enabled INTEGER NOT NULL DEFAULT 1,
  send_with_enter INTEGER NOT NULL DEFAULT 1,
  theme TEXT NOT NULL DEFAULT 'auto',     -- auto | light | dark
  accent TEXT NOT NULL DEFAULT 'indigo',
  font_size TEXT NOT NULL DEFAULT 'normal', -- small | normal | large
  media_quality TEXT NOT NULL DEFAULT 'optimized', -- optimized | hd
  auto_download TEXT NOT NULL DEFAULT 'wifi', -- always | wifi | never
  wallpaper TEXT,
  last_seen_at INTEGER,
  online INTEGER NOT NULL DEFAULT 0,
  onboarded INTEGER NOT NULL DEFAULT 0,
  -- Bot LLM (Ollama) fields. is_bot=1 marca usuários que respondem
  -- automaticamente via modelo local. Veja src/server/llm/personas.js.
  is_bot INTEGER NOT NULL DEFAULT 0,
  bot_model TEXT,             -- nome do modelo no Ollama (ex.: 'gemma3:270m')
  bot_system_prompt TEXT,     -- instrução de sistema (persona, regras, tom)
  bot_temperature REAL,       -- temperatura (criatividade); padrão 0.8
  bot_max_tokens INTEGER,     -- num_predict (tamanho máximo da resposta); padrão 256
  bot_tagline TEXT,           -- descrição curta exibida na lista de bots
  bot_vision INTEGER NOT NULL DEFAULT 0,  -- 1 se o bot aceita anexos de imagem
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username_normalized ON users(username_normalized);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Contatos: relação direcional (A adiciona B), permitindo derivar mútuo automaticamente.
CREATE TABLE IF NOT EXISTS contacts (
  owner_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  alias TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, contact_id),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contacts_contact ON contacts(contact_id);

-- Bloqueios (separados de contatos)
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id),
  FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Solicitações de contato (quando o destino bloqueia mensagens de desconhecidos)
CREATE TABLE IF NOT EXISTS contact_requests (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | rejected | expired
  created_at INTEGER NOT NULL,
  responded_at INTEGER,
  FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (from_id, to_id, status)
);

CREATE INDEX IF NOT EXISTS idx_contact_requests_to ON contact_requests(to_id, status);

-- Chats: 'direct' (1:1) ou 'group'
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- direct | group
  name TEXT,
  description TEXT,
  avatar_path TEXT,
  created_by TEXT,
  -- direct chat key (par ordenado de IDs) para garantir unicidade
  direct_key TEXT UNIQUE,
  -- permissões de grupo (JSON)
  group_settings TEXT, -- json: {edit_info: 'admins'|'all', add_members: 'admins'|'all', invite_link_enabled: bool, invite_link_visible: bool, invite_token: string}
  last_message_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_chats_last_message_at ON chats(last_message_at DESC);

-- Membros do chat (inclui directs e grupos)
CREATE TABLE IF NOT EXISTS chat_members (
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- member | admin | owner
  joined_at INTEGER NOT NULL,
  left_at INTEGER,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  muted_until INTEGER,
  draft TEXT,
  draft_updated_at INTEGER,
  last_read_message_id TEXT,
  last_read_at INTEGER,
  pinned_messages TEXT, -- json array de message ids fixados (a nível de chat)
  was_kicked INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_id, user_id),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);

-- Mensagens
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  type TEXT NOT NULL, -- text | image | video | audio | gif | document | system | voice | poll | sticker
  body TEXT,                 -- texto / legenda
  reply_to_id TEXT,
  forwarded_from_id TEXT,    -- id da mensagem original (se encaminhada)
  extra TEXT,                -- JSON com dados específicos do tipo (poll, voice metadata, etc.)
  edited_at INTEGER,
  edit_count INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- Histórico de edições
CREATE TABLE IF NOT EXISTS message_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  body_before TEXT,
  edited_at INTEGER NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_edits_msg ON message_edits(message_id);

-- Anexos (uma mensagem pode ter múltiplos)
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  kind TEXT NOT NULL, -- image | video | audio | gif | document
  mime TEXT,
  filename TEXT,
  size INTEGER,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  storage_path TEXT NOT NULL,    -- caminho relativo em uploads/originals
  thumb_path TEXT,               -- caminho da miniatura leve
  poster_path TEXT,              -- poster frame para vídeo
  hd INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

-- Status de entrega/leitura por destinatário
CREATE TABLE IF NOT EXISTS message_receipts (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  delivered_at INTEGER,
  read_at INTEGER,
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Reações
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Mensagens ocultas POR usuário (delete "apenas para mim").
-- A mensagem continua existindo no DB (e visível para os outros membros);
-- apenas SOMEM da view do usuário que escolheu apagar.
CREATE TABLE IF NOT EXISTS message_hides (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  hidden_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Mensagens favoritas (estrela), por usuário
CREATE TABLE IF NOT EXISTS message_stars (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Link previews por URL (cache)
CREATE TABLE IF NOT EXISTS link_previews (
  url TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  image_url TEXT,
  domain TEXT,
  fetched_at INTEGER NOT NULL,
  ok INTEGER NOT NULL DEFAULT 1
);

-- Sessões de auth (refresh implícito)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_agent TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Auditoria de ações sensíveis
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata TEXT,             -- json
  created_at INTEGER NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- Erros do sistema (visíveis no dashboard admin)
CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_error_created ON error_log(created_at DESC);

-- Denúncias
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_type TEXT NOT NULL, -- user | message | chat
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- open | reviewing | resolved | dismissed
  resolved_by TEXT,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- Feedback dos usuários
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  topic TEXT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================
-- Full-text search (FTS5)
-- =====================
-- Tabelas virtuais. tokenize 'unicode61' com remove_diacritics=2 → busca accent-insensitive e case-insensitive.

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  body,
  content='messages',
  content_rowid='rowid',
  tokenize="unicode61 remove_diacritics 2"
);

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, body) VALUES (new.rowid, COALESCE(new.body, ''));
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, body) VALUES('delete', old.rowid, COALESCE(old.body, ''));
END;
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, body) VALUES('delete', old.rowid, COALESCE(old.body, ''));
  INSERT INTO messages_fts(rowid, body) VALUES (new.rowid, COALESCE(new.body, ''));
END;

CREATE VIRTUAL TABLE IF NOT EXISTS users_fts USING fts5(
  name, username, bio,
  content='users',
  content_rowid='rowid',
  tokenize="unicode61 remove_diacritics 2"
);

CREATE TRIGGER IF NOT EXISTS users_ai AFTER INSERT ON users BEGIN
  INSERT INTO users_fts(rowid, name, username, bio)
    VALUES (new.rowid, COALESCE(new.name, ''), COALESCE(new.username, ''), COALESCE(new.bio, ''));
END;
CREATE TRIGGER IF NOT EXISTS users_ad AFTER DELETE ON users BEGIN
  INSERT INTO users_fts(users_fts, rowid, name, username, bio)
    VALUES('delete', old.rowid, COALESCE(old.name, ''), COALESCE(old.username, ''), COALESCE(old.bio, ''));
END;
CREATE TRIGGER IF NOT EXISTS users_au AFTER UPDATE ON users BEGIN
  INSERT INTO users_fts(users_fts, rowid, name, username, bio)
    VALUES('delete', old.rowid, COALESCE(old.name, ''), COALESCE(old.username, ''), COALESCE(old.bio, ''));
  INSERT INTO users_fts(rowid, name, username, bio)
    VALUES (new.rowid, COALESCE(new.name, ''), COALESCE(new.username, ''), COALESCE(new.bio, ''));
END;

CREATE VIRTUAL TABLE IF NOT EXISTS attachments_fts USING fts5(
  filename,
  content='attachments',
  content_rowid='rowid',
  tokenize="unicode61 remove_diacritics 2"
);

CREATE TRIGGER IF NOT EXISTS attachments_ai AFTER INSERT ON attachments BEGIN
  INSERT INTO attachments_fts(rowid, filename) VALUES (new.rowid, COALESCE(new.filename, ''));
END;
CREATE TRIGGER IF NOT EXISTS attachments_ad AFTER DELETE ON attachments BEGIN
  INSERT INTO attachments_fts(attachments_fts, rowid, filename) VALUES('delete', old.rowid, COALESCE(old.filename, ''));
END;

CREATE VIRTUAL TABLE IF NOT EXISTS chats_fts USING fts5(
  name, description,
  content='chats',
  content_rowid='rowid',
  tokenize="unicode61 remove_diacritics 2"
);

CREATE TRIGGER IF NOT EXISTS chats_ai AFTER INSERT ON chats BEGIN
  INSERT INTO chats_fts(rowid, name, description)
    VALUES (new.rowid, COALESCE(new.name, ''), COALESCE(new.description, ''));
END;
CREATE TRIGGER IF NOT EXISTS chats_ad AFTER DELETE ON chats BEGIN
  INSERT INTO chats_fts(chats_fts, rowid, name, description)
    VALUES('delete', old.rowid, COALESCE(old.name, ''), COALESCE(old.description, ''));
END;
CREATE TRIGGER IF NOT EXISTS chats_au AFTER UPDATE ON chats BEGIN
  INSERT INTO chats_fts(chats_fts, rowid, name, description)
    VALUES('delete', old.rowid, COALESCE(old.name, ''), COALESCE(old.description, ''));
  INSERT INTO chats_fts(rowid, name, description)
    VALUES (new.rowid, COALESCE(new.name, ''), COALESCE(new.description, ''));
END;

-- =====================
-- Histórico de buscas
-- =====================
-- Salvo por usuário; agrupado por query no SELECT para deduplicar.
CREATE TABLE IF NOT EXISTS search_history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   TEXT    NOT NULL,
  query     TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id, created_at DESC);
