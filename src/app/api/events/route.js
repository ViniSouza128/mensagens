import { withErrors } from '@/server/http';
import { requireUser } from '@/server/auth';
import { subscribe } from '@/server/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return withErrors(async () => {
    const u = await requireUser();

    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (event) => {
          try {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            // controller fechado
          }
        };
        // ping inicial
        send({ type: 'hello', user_id: u.id, ts: Date.now() });
        const unsub = subscribe(u.id, { send });

        // keep-alive
        const ping = setInterval(() => {
          try {
            controller.enqueue(enc.encode(`: ping\n\n`));
          } catch {
            // ignore
          }
        }, 25_000);

        const close = () => {
          clearInterval(ping);
          try { unsub(); } catch { /* noop */ }
          try { controller.close(); } catch { /* noop */ }
        };

        // The runtime não entrega close diretamente em todos casos; ping vai falhar e finalizar.
        // Í guardamos a função no estado para suportar abort.
        controller._cleanup = close;
      },
      cancel() {
        try { this._cleanup?.(); } catch { /* noop */ }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  });
}
