// Garante que diretórios essenciais existem antes de iniciar o Next.
// Se o banco de dados ainda não existe (primeira execução), roda o seed automaticamente.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const dirs = [
  process.env.DATA_DIR || 'data',
  process.env.UPLOADS_DIR || 'uploads',
  path.join(process.env.UPLOADS_DIR || 'uploads', 'originals'),
  path.join(process.env.UPLOADS_DIR || 'uploads', 'thumbs'),
  path.join(process.env.UPLOADS_DIR || 'uploads', 'posters'),
  process.env.LOGS_DIR || 'logs',
];

for (const d of dirs) {
  const p = path.resolve(root, d);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
    console.log('[prepare] criado', p);
  }
}

// Seed automático na primeira execução (quando o banco ainda não existe)
const dbPath = path.resolve(root, path.join(process.env.DATA_DIR || 'data', 'mensagens.db'));
if (!fs.existsSync(dbPath)) {
  console.log('[prepare] banco não encontrado — executando seed inicial...');
  try {
    execFileSync(process.execPath, [path.resolve(root, 'scripts/seed.mjs')], {
      stdio: 'inherit',
      cwd: root,
    });
    console.log('[prepare] seed concluído.');
  } catch (err) {
    console.error('[prepare] falha no seed:', err.message);
    process.exit(1);
  }
}
