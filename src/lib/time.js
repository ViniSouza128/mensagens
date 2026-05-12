export function now() {
  return Date.now();
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function isSameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function daysBetween(a, b) {
  return Math.floor((b - a) / DAY_MS);
}

export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function formatDateLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  if (isSameDay(d, today)) return 'Hoje';
  const yesterday = new Date(today.getTime() - DAY_MS);
  if (isSameDay(d, yesterday)) return 'Ontem';
  const opts = { day: '2-digit', month: 'short', year: 'numeric' };
  return d.toLocaleDateString('pt-BR', opts);
}

export function formatRelative(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'agora';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}min`;
  if (diff < DAY_MS) return formatTime(ts);
  if (diff < 7 * DAY_MS) return new Date(ts).toLocaleDateString('pt-BR', { weekday: 'short' });
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function formatFullDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
