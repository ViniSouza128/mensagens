// Normaliza strings para busca/comparação: minuscula, sem acentos, espaços colapsados.
export function normalize(input) {
  if (input == null) return '';
  return String(input)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeUsername(s) {
  return normalize(s).replace(/[^a-z0-9_\.]/g, '');
}

// Quebra um termo em tokens úteis para FTS5 (prefix match + AND).
export function toFtsQuery(raw) {
  const tokens = normalize(raw).split(' ').filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' AND ');
}
