import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { paths } from '@/config/env';

let _db = null;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function getDb() {
  if (_db) return _db;
  ensureDir(paths.dataDir);
  const file = path.join(paths.dataDir, 'mensagens.db');
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  _db = db;
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
}

// Pequeno helper para transações.
export function tx(fn) {
  const db = getDb();
  const wrapped = db.transaction(fn);
  return wrapped();
}
