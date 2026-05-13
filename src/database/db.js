import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { paths } from '@/config/env';
import { decryptMessageBody, validateMessageCryptoConfig } from '@/server/crypto/messageCrypto';

let _db = null;
let _migrationsRan = false;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function getDb() {
  if (_db) return _db;
  try {
    validateMessageCryptoConfig();
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      // Ajuda no dev: sem a chave o app ate poderia abrir, mas qualquer texto
      // salvo ficaria impossivel de proteger. Falhar cedo evita banco misto.
      // eslint-disable-next-line no-console
      console.error(err.message);
    }
    throw err;
  }
  ensureDir(paths.dataDir);
  const file = path.join(paths.dataDir, 'mensagens.db');
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  _db = db;
  if (!_migrationsRan) {
    runMigrations(db);
    _migrationsRan = true;
  }
  return db;
}

export function runSchema() {
  const schemaPath = path.join(process.cwd(), 'src', 'database', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const db = getDb();
  db.exec(sql);
  runMigrations(db);
}

// Migrações idempotentes — colunas adicionadas em versões posteriores ao schema base.
function runMigrations(db) {
  const migrations = [
    // v3: coluna `extra` na tabela messages para armazenar JSON de polls/voice.
    "ALTER TABLE messages ADD COLUMN extra TEXT",
    // v4: usuários-bot (LLMs Ollama locais). Aplicado em bases criadas antes desta feature.
    "ALTER TABLE users ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN bot_model TEXT",
    "ALTER TABLE users ADD COLUMN bot_system_prompt TEXT",
    "ALTER TABLE users ADD COLUMN bot_temperature REAL",
    "ALTER TABLE users ADD COLUMN bot_max_tokens INTEGER",
    "ALTER TABLE users ADD COLUMN bot_tagline TEXT",
    // v5: flag de bot que aceita imagens (vision model)
    "ALTER TABLE users ADD COLUMN bot_vision INTEGER NOT NULL DEFAULT 0",
    // v6: tabela `message_hides` para delete "só pra mim". Não é ALTER mas
    // CREATE TABLE — usa IF NOT EXISTS para ser idempotente.
    `CREATE TABLE IF NOT EXISTS message_hides (
       message_id TEXT NOT NULL,
       user_id TEXT NOT NULL,
       hidden_at INTEGER NOT NULL,
       PRIMARY KEY (message_id, user_id),
       FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
     )`,
  ];
  for (const sql of migrations) {
    try { db.exec(sql); }
    catch (e) {
      // Ignora "duplicate column name" — migração já aplicada.
      if (!/duplicate column|already exists/i.test(e.message)) {
        // eslint-disable-next-line no-console
        console.warn('[migrations] skip:', e.message);
      }
    }
  }
  runNamedMigration(db, 'messages_fts_plain_v1', () => rebuildMessagesFtsAsPlaintext(db));
}

function tableExists(db, name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = ? AND type IN ('table','virtual table')").get(name);
}

function runNamedMigration(db, id, fn) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_migrations (
        id TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);
    if (db.prepare('SELECT 1 FROM app_migrations WHERE id = ?').get(id)) return;
    fn();
    db.prepare('INSERT INTO app_migrations (id, applied_at) VALUES (?, ?)').run(id, Date.now());
  } catch (e) {
    // Bancos recem-criados pelo fluxo de login/register podem ainda nao ter
    // todas as tabelas antes do runSchema; nesse caso a proxima chamada aplica.
    // eslint-disable-next-line no-console
    console.warn('[migrations] skip named:', id, e.message);
  }
}

function rebuildMessagesFtsAsPlaintext(db) {
  if (!tableExists(db, 'messages')) return;

  // Nivel 2 cifra messages.body, mas a busca precisa de plaintext para FTS5.
  // Por isso removemos os triggers antigos, recriamos messages_fts sem
  // content='messages' e passamos a alimentar o indice explicitamente no
  // codigo, sempre com o texto antes de cifrar.
  db.exec(`
    DROP TRIGGER IF EXISTS messages_ai;
    DROP TRIGGER IF EXISTS messages_ad;
    DROP TRIGGER IF EXISTS messages_au;
    DROP TABLE IF EXISTS messages_fts;
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      body,
      tokenize="unicode61 remove_diacritics 2"
    );
  `);

  const rows = db.prepare('SELECT rowid, body FROM messages').all();
  const insert = db.prepare('INSERT INTO messages_fts(rowid, body) VALUES (?, ?)');
  const txRebuild = db.transaction((items) => {
    for (const row of items) {
      insert.run(row.rowid, decryptMessageBody(row.body) || '');
    }
  });
  txRebuild(rows);
}

// Pequeno helper para transações.
export function tx(fn) {
  const db = getDb();
  const wrapped = db.transaction(fn);
  return wrapped();
}
