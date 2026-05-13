import crypto from 'node:crypto';

const VERSION_PREFIX = 'v1:';
const KEY_BYTES = 32;
const IV_BYTES = 12;
let cachedKey = null;

// Campos textuais sensiveis dentro de messages.extra.
// O JSON inteiro fica legivel para preservar flags, duracoes e metadados usados
// pela UI; so ciframos textos que podem carregar conteudo privado do usuario.
const EXTRA_TEXT_FIELDS = [
  ['caption'],
  ['poll', 'question'],
  ['poll', 'options', '*', 'text'],
  ['voice', 'transcript'],
];

function messageKeyError() {
  return new Error(
    '[mensagens] MESSAGE_ENCRYPTION_KEY ausente ou invalida. ' +
    'Defina uma chave AES-256-GCM com 32 bytes em base64. ' +
    'Em dev, gere uma com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
  );
}

export function getMessageEncryptionKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.MESSAGE_ENCRYPTION_KEY;
  if (!raw) throw messageKeyError();
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) throw messageKeyError();
  cachedKey = key;
  return cachedKey;
}

export function validateMessageCryptoConfig() {
  getMessageEncryptionKey();
  return true;
}

export function isEncryptedMessageBody(value) {
  return typeof value === 'string' && value.startsWith(VERSION_PREFIX);
}

export function encryptMessageBody(plaintext) {
  if (plaintext == null || plaintext === '') return plaintext;
  if (isEncryptedMessageBody(plaintext)) return plaintext;
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMessageEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptMessageBody(stored) {
  if (stored == null || stored === '') return stored;
  if (!isEncryptedMessageBody(stored)) return stored;
  const parts = stored.split(':');
  if (parts.length !== 4) throw new Error('[mensagens] Corpo de mensagem cifrado em formato invalido.');
  const [, iv64, tag64, cipher64] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getMessageEncryptionKey(),
    Buffer.from(iv64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tag64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(cipher64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

function cloneJson(value) {
  if (!value || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function transformPath(root, path, transform) {
  if (!root || typeof root !== 'object') return;
  const [head, ...tail] = path;
  if (!head) return;
  if (head === '*') {
    if (!Array.isArray(root)) return;
    for (const item of root) transformPath(item, tail, transform);
    return;
  }
  if (!(head in root)) return;
  if (tail.length === 0) {
    if (typeof root[head] === 'string') root[head] = transform(root[head]);
    return;
  }
  transformPath(root[head], tail, transform);
}

function transformExtra(extra, transform) {
  if (!extra || typeof extra !== 'object') return extra;
  const next = cloneJson(extra);
  for (const path of EXTRA_TEXT_FIELDS) transformPath(next, path, transform);
  return next;
}

export function encryptMessageExtra(extra) {
  return transformExtra(extra, encryptMessageBody);
}

export function decryptMessageExtra(extra) {
  return transformExtra(extra, decryptMessageBody);
}

export function decryptMessageExtraJson(stored) {
  if (!stored) return stored;
  try {
    return JSON.stringify(decryptMessageExtra(JSON.parse(stored)));
  } catch {
    return stored;
  }
}

export function decryptMessageRow(row) {
  if (!row) return row;
  return {
    ...row,
    body: decryptMessageBody(row.body),
    extra: decryptMessageExtraJson(row.extra),
  };
}

export function decryptMessageEditRow(row) {
  if (!row) return row;
  return {
    ...row,
    body_before: decryptMessageBody(row.body_before),
  };
}
