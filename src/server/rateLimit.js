// Rate limit em memória por (chave, janela). Suficiente para uma instância.
// Para multi-instância, trocar por Redis.
const buckets = new Map();

export function checkRate(key, { windowMs = 60_000, max = 60 } = {}) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt < now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  return {
    allowed: b.count <= max,
    remaining: Math.max(0, max - b.count),
    resetAt: b.resetAt,
  };
}

// Limpa periodicamente buckets vencidos para evitar crescimento indefinido.
let _gc = null;
function startGc() {
  if (_gc) return;
  _gc = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) {
      if (v.resetAt < now) buckets.delete(k);
    }
  }, 60_000).unref?.();
}
startGc();
