import { linkPreviewCfg } from '@/config/env';
import { isLikelyPrivateHost, safeDomain } from '@/lib/url';
import { getDb } from '@/database/db';
import { logger } from '@/server/logger';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function decodeEntities(s) {
  if (!s) return s;
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function pickMeta(html, names) {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i');
    const m = html.match(re);
    if (m && m[1]) return decodeEntities(m[1].trim());
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, 'i');
    const m2 = html.match(re2);
    if (m2 && m2[1]) return decodeEntities(m2[1].trim());
  }
  return null;
}

function pickTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1].trim()) : null;
}

function readCached(url) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM link_previews WHERE url = ?').get(url);
  if (!row) return null;
  if (Date.now() - row.fetched_at > CACHE_TTL_MS) return null;
  return row;
}

function writeCached(url, data) {
  const db = getDb();
  db.prepare(
    `INSERT INTO link_previews (url, title, description, image_url, domain, fetched_at, ok)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET
       title=excluded.title, description=excluded.description, image_url=excluded.image_url,
       domain=excluded.domain, fetched_at=excluded.fetched_at, ok=excluded.ok`
  ).run(url, data.title, data.description, data.image_url, data.domain, Date.now(), data.ok ? 1 : 0);
}

export async function fetchLinkPreview(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (isLikelyPrivateHost(url.hostname)) {
    return { url: url.href, ok: false, error: 'forbidden_host' };
  }

  const cached = readCached(url.href);
  if (cached) {
    return {
      url: url.href,
      ok: !!cached.ok,
      title: cached.title,
      description: cached.description,
      image_url: cached.image_url,
      domain: cached.domain,
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), linkPreviewCfg.timeoutMs);

  try {
    // Follow redirects manually so we can re-validate the hostname after each hop.
    // Using redirect:'follow' would let a server redirect us to an internal address
    // even though the initial hostname passed the SSRF check.
    const MAX_REDIRECTS = 5;
    let currentHref = url.href;
    let res;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetch(currentHref, {
        method: 'GET',
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'MensagensBot/1.0 (+link-preview)',
          Accept: 'text/html,*/*;q=0.5',
        },
      });
      if (res.status < 300 || res.status >= 400) break;
      const location = res.headers.get('location');
      if (!location) break;
      let nextUrl;
      try { nextUrl = new URL(location, currentHref); } catch { break; }
      if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') break;
      if (isLikelyPrivateHost(nextUrl.hostname)) {
        writeCached(url.href, { ok: false, title: null, description: null, image_url: null, domain: safeDomain(url.href) });
        return { url: url.href, ok: false, error: 'forbidden_redirect' };
      }
      currentHref = nextUrl.href;
    }

    if (!res || !res.ok) {
      writeCached(url.href, { ok: false, title: null, description: null, image_url: null, domain: safeDomain(url.href) });
      return { url: url.href, ok: false };
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text/html')) {
      const data = { ok: true, title: null, description: null, image_url: null, domain: safeDomain(url.href) };
      writeCached(url.href, data);
      return { url: url.href, ...data };
    }
    // limita bytes
    const reader = res.body?.getReader?.();
    if (!reader) {
      writeCached(url.href, { ok: false, title: null, description: null, image_url: null, domain: safeDomain(url.href) });
      return { url: url.href, ok: false };
    }
    const chunks = [];
    let total = 0;
    while (total < linkPreviewCfg.maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    try { reader.cancel(); } catch { /* noop */ }
    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');

    const title =
      pickMeta(html, ['og:title', 'twitter:title']) || pickTitle(html);
    const description =
      pickMeta(html, ['og:description', 'twitter:description', 'description']);
    let image = pickMeta(html, ['og:image', 'twitter:image']);
    if (image && image.startsWith('//')) image = url.protocol + image;
    if (image && image.startsWith('/')) image = url.origin + image;
    // Validate the og:image URL — it could point to an internal host
    if (image) {
      try {
        const imgUrl = new URL(image);
        if ((imgUrl.protocol !== 'http:' && imgUrl.protocol !== 'https:') || isLikelyPrivateHost(imgUrl.hostname)) {
          image = null;
        }
      } catch {
        image = null;
      }
    }

    const data = {
      ok: true,
      title: title?.slice(0, 200) || null,
      description: description?.slice(0, 400) || null,
      image_url: image || null,
      domain: safeDomain(url.href),
    };
    writeCached(url.href, data);
    return { url: url.href, ...data };
  } catch (err) {
    logger.warn('link preview failed', { url: url.href, message: err?.message });
    writeCached(url.href, { ok: false, title: null, description: null, image_url: null, domain: safeDomain(url.href) });
    return { url: url.href, ok: false };
  } finally {
    clearTimeout(timer);
  }
}
