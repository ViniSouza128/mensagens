// Helpers para detecção e exibição segura de URLs.

const URL_REGEX = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

export function findUrls(text) {
  if (!text) return [];
  const found = [];
  const seen = new Set();
  const matches = text.matchAll(URL_REGEX);
  for (const m of matches) {
    let raw = m[1];
    if (raw.startsWith('www.')) raw = 'http://' + raw;
    try {
      const u = new URL(raw);
      if (!seen.has(u.href)) {
        seen.add(u.href);
        found.push({ raw: m[1], href: u.href, host: u.host, pathname: u.pathname });
      }
    } catch {
      // ignora URLs inválidas
    }
  }
  return found;
}

// Retorna a "primeira" URL válida no texto (para preview enquanto digita).
export function firstUrl(text) {
  const arr = findUrls(text);
  return arr[0] || null;
}

// Versão discreta da URL para mostrar antes do envio: esconde tudo após '?'.
export function shortDisplayUrl(href) {
  if (!href) return '';
  try {
    const u = new URL(href);
    let display = u.host + u.pathname;
    if (display.length > 60) display = display.slice(0, 57) + '…';
    return display;
  } catch {
    const idx = href.indexOf('?');
    return idx >= 0 ? href.slice(0, idx) : href;
  }
}

export function safeDomain(href) {
  try {
    return new URL(href).host;
  } catch {
    return '';
  }
}

// Bloqueia URLs apontando para alvos privados (SSRF). Aplicado server-side.
const PRIVATE_HOSTNAMES = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.|0\.|::1|fc00:|fd00:|fe80:)/i;

export function isLikelyPrivateHost(hostname) {
  if (!hostname) return true;
  return PRIVATE_HOSTNAMES.test(hostname);
}

// Sanitiza atributo href para evitar javascript: ou data: maliciosos.
export function sanitizeHref(href) {
  if (!href) return null;
  const trimmed = String(href).trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return null;
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return null;
}
