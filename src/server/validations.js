import { HttpError } from '@/server/auth';

export function assert(cond, code, info) {
  if (!cond) throw new HttpError(400, code, info);
}

export function isString(v, { min = 0, max = Infinity } = {}) {
  return typeof v === 'string' && v.length >= min && v.length <= max;
}

export function validateUsername(u) {
  assert(typeof u === 'string', 'invalid_username');
  assert(/^[a-zA-Z0-9_.]{3,24}$/.test(u), 'invalid_username');
}

export function validateEmail(e) {
  assert(typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), 'invalid_email');
}

export function validatePassword(p) {
  assert(typeof p === 'string' && p.length >= 6 && p.length <= 200, 'invalid_password');
}

export function validateName(n) {
  assert(typeof n === 'string' && n.trim().length >= 1 && n.trim().length <= 80, 'invalid_name');
}

export function validateMessageBody(b, { allowEmpty = false } = {}) {
  if (b == null || b === '') {
    assert(allowEmpty, 'empty_message');
    return '';
  }
  assert(typeof b === 'string', 'invalid_body');
  assert(b.length <= 8000, 'message_too_long');
  return b;
}
