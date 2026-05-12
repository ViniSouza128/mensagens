// Aplica o schema e cria usuários iniciais (admin, demo e bots LLM).
//
// Idempotente: roda quantas vezes quiser. Usuários humanos não são alterados
// se já existirem; bots são *atualizados* a cada execução (model, prompt,
// temperatura, etc) para que ajustes nas personas em src/server/llm/personas.js
// se reflitam no banco sem precisar deletar manualmente.

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';

// Personas dos bots — importadas via path absoluto file:// para funcionar
// no ESM do Node sem precisar de bundler.
const personasUrl = new URL('../src/server/llm/personas.js', import.meta.url);
const { BOTS } = await import(personasUrl);

const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

const root = process.cwd();
const dataDir = path.resolve(root, process.env.DATA_DIR || 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'mensagens.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.resolve(root, 'src/database/schema.sql'), 'utf8');
db.exec(schema);

// Migrações idempotentes (mesmas de src/database/db.js#runMigrations).
// Importante para bases criadas em versões anteriores: garante as colunas de bot
// antes do upsert abaixo.
const MIGRATIONS = [
  "ALTER TABLE messages ADD COLUMN extra TEXT",
  "ALTER TABLE users ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN bot_model TEXT",
  "ALTER TABLE users ADD COLUMN bot_system_prompt TEXT",
  "ALTER TABLE users ADD COLUMN bot_temperature REAL",
  "ALTER TABLE users ADD COLUMN bot_max_tokens INTEGER",
  "ALTER TABLE users ADD COLUMN bot_tagline TEXT",
];
for (const sql of MIGRATIONS) {
  try { db.exec(sql); }
  catch (e) {
    if (!/duplicate column|already exists/i.test(e.message)) {
      console.warn('[seed] migration skip:', e.message);
    }
  }
}

const now = Date.now();

function normalize(s) {
  // Remove diacríticos (combining marks U+0300..U+036F) para username/email keys.
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function upsertUser({ username, email, password, name, isAdmin = false, bio = '' }) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    console.log('[seed] usuário já existe:', username);
    return existing.id;
  }
  const id = nano();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO users (
      id, username, username_normalized, email, password_hash, name, bio,
      is_admin, status, onboarded, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)`
  ).run(id, username, normalize(username), email, hash, name, bio, isAdmin ? 1 : 0, now, now);
  console.log('[seed] criado usuário:', username, isAdmin ? '(admin)' : '');
  return id;
}

/**
 * Upsert de bots. Diferente do usuário humano: se já existir, ATUALIZA os
 * campos do bot (model, prompt, temperatura) para refletir mudanças em
 * personas.js. A senha do bot é aleatória (ele nunca faz login).
 */
function upsertBot(bot) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(bot.username);
  if (existing) {
    db.prepare(
      `UPDATE users SET
        name = ?, bio = ?,
        is_bot = 1,
        bot_model = ?, bot_system_prompt = ?,
        bot_temperature = ?, bot_max_tokens = ?, bot_tagline = ?,
        updated_at = ?
       WHERE id = ?`
    ).run(
      bot.name, bot.bio || '',
      bot.model, bot.system,
      bot.temperature ?? 0.8, bot.max_tokens ?? 256, bot.tagline || '',
      now, existing.id
    );
    console.log('[seed] bot atualizado:', bot.username, '→', bot.model);
    return existing.id;
  }

  const id = nano();
  // Senha aleatória, hash forte — o bot não faz login pelo cookie. Mantemos
  // a coluna `password_hash` NOT NULL preenchida para satisfazer o schema.
  const randomPass = nano() + nano();
  const hash = bcrypt.hashSync(randomPass, 10);
  db.prepare(
    `INSERT INTO users (
      id, username, username_normalized, email, password_hash, name, bio,
      is_admin, status, onboarded,
      is_bot, bot_model, bot_system_prompt, bot_temperature, bot_max_tokens, bot_tagline,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'active', 1, 1, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, bot.username, normalize(bot.username), `${bot.username}@bots.local`, hash,
    bot.name, bot.bio || '',
    bot.model, bot.system, bot.temperature ?? 0.8, bot.max_tokens ?? 256, bot.tagline || '',
    now, now
  );
  console.log('[seed] bot criado:', bot.username, '→', bot.model);
  return id;
}

// =====================
// Usuários humanos
// =====================
const adminId = upsertUser({
  username: process.env.ADMIN_USERNAME || 'admin',
  email: process.env.ADMIN_EMAIL || 'admin@mensagens.local',
  password: process.env.ADMIN_PASSWORD || 'admin123',
  name: process.env.ADMIN_NAME || 'Administrador',
  isAdmin: true,
  bio: 'Conta administrativa do sistema.',
});

upsertUser({ username: 'ana', email: 'ana@mensagens.local', password: 'ana12345', name: 'Ana Lima', bio: 'Designer de produto' });
upsertUser({ username: 'bruno', email: 'bruno@mensagens.local', password: 'bruno12345', name: 'Bruno Souza', bio: 'Engenheiro de software' });
upsertUser({ username: 'clara', email: 'clara@mensagens.local', password: 'clara12345', name: 'Clara Mendes', bio: 'Pesquisadora UX' });

// =====================
// Bots LLM (Ollama)
// =====================
for (const bot of BOTS) {
  upsertBot(bot);
}

db.close();
console.log('[seed] concluído. Admin id:', adminId, '· bots:', BOTS.length);
