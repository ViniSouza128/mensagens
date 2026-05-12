import { customAlphabet } from 'nanoid';

const alpha = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);
const short = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

export function newId() {
  return alpha();
}

export function newShortId() {
  return short();
}

export function directKey(a, b) {
  return [a, b].sort().join(':');
}
