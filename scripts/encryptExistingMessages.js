// Migra mensagens antigas para criptografia em repouso.
// Rode com: npm run encrypt-existing
//
// O script carrega .env.local/.env porque `node scripts/...` nao passa pelo
// loader de env do Next. Sem isso o Vini teria que exportar a chave na mao.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const root = process.cwd();
loadEnvFile(path.join(root, '.env'));
loadEnvFile(path.join(root, '.env.local'));

const VERSION_PREFIX = 'v1:';
const key = loadKey();
const dbPath = path.resolve(root, process.env.DATA_DIR || 'data', 'mensagens.db');

if (!fs.existsSync(dbPath)) {
  console.error('[encrypt-existing] banco nao encontrado:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const pendingMessages = db
  .prepare("SELECT COUNT(*) AS n FROM messages WHERE body IS NOT NULL AND body <> '' AND body NOT LIKE 'v1:%'")
  .get().n;
const pendingEdits = db
  .prepare("SELECT COUNT(*) AS n FROM message_edits WHERE body_before IS NOT NULL AND body_before <> '' AND body_before NOT LIKE 'v1:%'")
  .get().n;

const messageRows = db
  .prepare("SELECT id, body FROM messages WHERE body IS NOT NULL AND body <> '' AND body NOT LIKE 'v1:%'")
  .all();
const editRows = db
  .prepare("SELECT id, body_before FROM message_edits WHERE body_before IS NOT NULL AND body_before <> '' AND body_before NOT LIKE 'v1:%'")
  .all();
const extraRows = db
  .prepare("SELECT id, extra FROM messages WHERE extra IS NOT NULL AND extra <> ''")
  .all();

const updateMessage = db.prepare('UPDATE messages SET body = ? WHERE id = ?');
const updateEdit = db.prepare('UPDATE message_edits SET body_before = ? WHERE id = ?');
const updateExtra = db.prepare('UPDATE messages SET extra = ? WHERE id = ?');

let extrasChanged = 0;
const migrate = db.transaction(() => {
  for (const row of messageRows) updateMessage.run(encrypt(row.body), row.id);
  for (const row of editRows) updateEdit.run(encrypt(row.body_before), row.id);
  for (const row of extraRows) {
    const next = encryptExtraJson(row.extra);
    if (next && next !== row.extra) {
      updateExtra.run(next, row.id);
      extrasChanged++;
    }
  }
  rebuildMessagesFts();
});

migrate();

const encryptedMessages = db
  .prepare("SELECT COUNT(*) AS n FROM messages WHERE body LIKE 'v1:%'")
  .get().n;
const encryptedEdits = db
  .prepare("SELECT COUNT(*) AS n FROM message_edits WHERE body_before LIKE 'v1:%'")
  .get().n;

console.log('[encrypt-existing] mensagens pendentes antes:', pendingMessages);
console.log('[encrypt-existing] message_edits pendentes antes:', pendingEdits);
console.log('[encrypt-existing] mensagens cifradas nesta execucao:', messageRows.length);
console.log('[encrypt-existing] historicos cifrados nesta execucao:', editRows.length);
console.log('[encrypt-existing] extras sensiveis atualizados:', extrasChanged);
console.log('[encrypt-existing] mensagens com prefixo v1 depois:', encryptedMessages);
console.log('[encrypt-existing] body_before com prefixo v1 depois:', encryptedEdits);
console.log('[encrypt-existing] FTS reconstruida com plaintext controlado.');

db.close();

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const name = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(name in process.env)) process.env[name] = value;
  }
}

function loadKey() {
  const raw = process.env.MESSAGE_ENCRYPTION_KEY;
  const buf = raw ? Buffer.from(raw, 'base64') : null;
  if (!buf || buf.length !== 32) {
    console.error(
      '[encrypt-existing] MESSAGE_ENCRYPTION_KEY ausente ou invalida. Gere com:\n' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
    process.exit(1);
  }
  return buf;
}

function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return plaintext;
  if (String(plaintext).startsWith(VERSION_PREFIX)) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

function decrypt(stored) {
  if (stored == null || stored === '') return stored;
  if (!String(stored).startsWith(VERSION_PREFIX)) return stored;
  const [, iv64, tag64, cipher64] = String(stored).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv64, 'base64'));
  decipher.setAuthTag(Buffer.from(tag64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(cipher64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function encryptExtraJson(raw) {
  try {
    const obj = JSON.parse(raw);
    const before = JSON.stringify(obj);
    transformExtra(obj, encrypt);
    const after = JSON.stringify(obj);
    return before === after ? raw : after;
  } catch {
    return raw;
  }
}

function transformExtra(extra, transform) {
  applyPath(extra, ['caption'], transform);
  applyPath(extra, ['poll', 'question'], transform);
  applyPath(extra, ['poll', 'options', '*', 'text'], transform);
  applyPath(extra, ['voice', 'transcript'], transform);
}

function applyPath(rootValue, parts, transform) {
  if (!rootValue || typeof rootValue !== 'object') return;
  const [head, ...tail] = parts;
  if (head === '*') {
    if (!Array.isArray(rootValue)) return;
    for (const item of rootValue) applyPath(item, tail, transform);
    return;
  }
  if (!(head in rootValue)) return;
  if (tail.length === 0) {
    if (typeof rootValue[head] === 'string') rootValue[head] = transform(rootValue[head]);
    return;
  }
  applyPath(rootValue[head], tail, transform);
}

function rebuildMessagesFts() {
  db.exec(`
    DROP TRIGGER IF EXISTS messages_ai;
    DROP TRIGGER IF EXISTS messages_ad;
    DROP TRIGGER IF EXISTS messages_au;
    DROP TABLE IF EXISTS messages_fts;
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      body,
      tokenize="unicode61 remove_diacritics 2"
    );
    CREATE TABLE IF NOT EXISTS app_migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const rows = db.prepare('SELECT rowid, body FROM messages').all();
  const insert = db.prepare('INSERT INTO messages_fts(rowid, body) VALUES (?, ?)');
  for (const row of rows) insert.run(row.rowid, decrypt(row.body) || '');
  db.prepare(
    `INSERT INTO app_migrations (id, applied_at)
     VALUES ('messages_fts_plain_v1', ?)
     ON CONFLICT(id) DO UPDATE SET applied_at = excluded.applied_at`
  ).run(Date.now());
}
