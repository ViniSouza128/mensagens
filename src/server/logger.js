import fs from 'node:fs';
import path from 'node:path';
import { paths } from '@/config/env';
import { getDb } from '@/database/db';

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function appendFile(level, line) {
  try {
    ensureDir(paths.logsDir);
    const file = path.join(paths.logsDir, 'app.log');
    fs.appendFileSync(file, `[${new Date().toISOString()}] [${level}] ${line}\n`);
  } catch {
    // não derruba o app por falha de log
  }
}

function persist(level, message, meta) {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO error_log (level, message, stack, metadata, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(level, message, meta?.stack || null, meta ? JSON.stringify(safeMeta(meta)) : null, Date.now());
  } catch {
    // ignora
  }
}

function safeMeta(meta) {
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (k === 'stack') continue;
    try {
      JSON.stringify(v);
      out[k] = v;
    } catch {
      out[k] = String(v);
    }
  }
  return out;
}

export const logger = {
  info(message, meta) {
    appendFile('info', message + (meta ? ' ' + safe(meta) : ''));
  },
  warn(message, meta) {
    appendFile('warn', message + (meta ? ' ' + safe(meta) : ''));
    persist('warn', message, meta);
  },
  error(message, meta) {
    const m = meta || {};
    appendFile('error', message + ' ' + (m.stack || safe(m)));
    persist('error', message, m);
  },
};

function safe(o) {
  try {
    return JSON.stringify(o);
  } catch {
    return String(o);
  }
}
