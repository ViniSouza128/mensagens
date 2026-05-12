// Aplica o schema SQL no banco SQLite local.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const root = process.cwd();
const dataDir = path.resolve(root, process.env.DATA_DIR || 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'mensagens.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const sql = fs.readFileSync(path.resolve(root, 'src/database/schema.sql'), 'utf8');
db.exec(sql);
db.close();
console.log('[migrate] schema aplicado em', path.join(dataDir, 'mensagens.db'));
