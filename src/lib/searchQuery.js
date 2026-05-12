/**
 * Search query utilities — normalization, FTS5 query building, snippet highlighting.
 *
 * Multi-pass strategy (in order of precision):
 *   1. Strict: ALL tokens required (AND) — best precision
 *   2. Relaxed: ANY token matches (OR) — higher recall
 *   3. Fuzzy: each token OR'd with a shorter prefix (~65% length) — typo tolerance
 *   4. LIKE fallback: plain substring match on normalized text
 *
 * Fuzzy example:
 *   "playstaton" (9 chars) → "playstaton"* OR "playst"* (6 chars)
 *   → matches "playstation" ✓
 */

import { normalize } from './normalize';

/**
 * Tokenize a raw search string into normalized, non-empty tokens.
 * Filters out tokens shorter than 1 character.
 */
export function tokenize(raw) {
  return normalize(raw)
    .split(' ')
    .filter((t) => t.length >= 1);
}

/** ALL tokens must appear — highest confidence. */
export function buildStrictQuery(tokens) {
  if (!tokens.length) return null;
  return tokens.map(ftsToken).join(' AND ');
}

/** ANY token matches — broader recall. */
export function buildRelaxedQuery(tokens) {
  if (!tokens.length) return null;
  return tokens.map(ftsToken).join(' OR ');
}

/**
 * Fuzzy query: for each token ≥ 5 chars, also try a shorter prefix (65% of length).
 * Groups joined with OR so any fuzzy variant can match.
 *
 * "playstaton" → ("playstaton"* OR "playst"*)
 * "pro"        → "pro"*
 */
export function buildFuzzyQuery(tokens) {
  if (!tokens.length) return null;
  const parts = tokens.map((t) => {
    const exact = ftsToken(t);
    if (t.length < 5) return exact;
    const shortLen = Math.max(3, Math.floor(t.length * 0.65));
    const short = t.slice(0, shortLen);
    return short !== t ? `(${exact} OR ${ftsToken(short)})` : exact;
  });
  return parts.join(' OR ');
}

/** Wrap a single token as an FTS5 prefix-match term (escaped). */
function ftsToken(t) {
  return `"${t.replace(/"/g, '""')}"*`;
}

/**
 * Run `fn(ftsQuery)` with each query strategy in order, accumulating
 * unique results (by `idFn`) across passes until `limit` is reached.
 * Stops trying new passes once enough results are found.
 *
 * @param {string[]} tokens
 * @param {(q: string) => any[]} fn — receives FTS query, returns rows
 * @param {(row: any) => string} idFn — extract dedup key from a row
 * @param {number} limit — desired result count
 */
export function multipassFts(tokens, fn, idFn = (r) => r.id, limit = 50) {
  const seen = new Set();
  const results = [];

  for (const build of [buildStrictQuery, buildRelaxedQuery, buildFuzzyQuery]) {
    if (results.length >= limit) break;
    const q = build(tokens);
    if (!q) continue;
    try {
      const rows = fn(q);
      for (const row of rows) {
        const key = idFn(row);
        if (!seen.has(key)) {
          seen.add(key);
          results.push(row);
          if (results.length >= limit) break;
        }
      }
    } catch {
      // Invalid FTS syntax or runtime error — try next strategy
    }
  }

  return results;
}

/**
 * Parse a snippet string produced by FTS5 `snippet()` or `makeSnippet()`.
 * Returns an array of { text: string, highlight: boolean } segments.
 * Safe — does NOT use dangerouslySetInnerHTML.
 */
export function parseSnippet(raw) {
  if (!raw) return [{ text: '', highlight: false }];
  const parts = raw.split(/(<mark>|<\/mark>)/);
  const segments = [];
  let inMark = false;
  for (const part of parts) {
    if (part === '<mark>') { inMark = true; continue; }
    if (part === '</mark>') { inMark = false; continue; }
    if (part) segments.push({ text: part, highlight: inMark });
  }
  return segments.length ? segments : [{ text: raw, highlight: false }];
}

/**
 * Insert <mark> tags around occurrences of any token in `text`.
 * Case-insensitive, operates on already-normalized source.
 * Used for LIKE-fallback results that don't have FTS5 snippets.
 */
export function markTerms(text, tokens) {
  if (!text || !tokens.length) return text || '';
  let result = String(text);
  for (const token of tokens) {
    if (!token) continue;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      result = result.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
    } catch { /* ignore */ }
  }
  return result;
}

/**
 * Extract a ~180-char snippet around the first matched token, with <mark> highlighting.
 * Used for LIKE-fallback results.
 */
export function makeSnippet(text, tokens, maxChars = 180) {
  if (!text) return '';
  const norm = normalize(text);
  let pos = -1;
  for (const t of tokens) {
    const i = norm.indexOf(t);
    if (i >= 0) { pos = i; break; }
  }
  const start = pos < 0 ? 0 : Math.max(0, pos - 60);
  const end = Math.min(text.length, start + maxChars);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + markTerms(text.slice(start, end), tokens) + suffix;
}
