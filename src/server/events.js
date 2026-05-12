// Bus simples de eventos in-memory para SSE.
// Cada usuário conectado tem 1+ canais.
// Eventos são entregues a todos os subscribers do destinatário.

const subscribers = new Map(); // userId -> Set<{ send(event) }>

export function subscribe(userId, channel) {
  let set = subscribers.get(userId);
  if (!set) {
    set = new Set();
    subscribers.set(userId, set);
  }
  set.add(channel);
  return () => {
    const s = subscribers.get(userId);
    if (s) {
      s.delete(channel);
      if (s.size === 0) subscribers.delete(userId);
    }
  };
}

export function publish(userIds, event) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  for (const uid of ids) {
    const set = subscribers.get(uid);
    if (!set) continue;
    for (const ch of set) {
      try {
        ch.send(event);
      } catch {
        // ignore
      }
    }
  }
}

export function activeCount() {
  let n = 0;
  for (const s of subscribers.values()) n += s.size;
  return n;
}
