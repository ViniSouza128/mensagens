import { ok, withErrors, readBody } from '@/server/http';
import { requireUser } from '@/server/auth';
import { editMessage, deleteMessage, getMessageDetails, hideMessageForUser } from '@/server/handlers/messages';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    return ok(getMessageDetails({ messageId: params.id, viewerId: u.id }));
  });
}

export async function PATCH(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    const { body } = await readBody(req);
    return ok(editMessage({ messageId: params.id, userId: u.id, body }));
  });
}

/**
 * DELETE /api/messages/:id?scope=me|everyone
 *
 * - scope=me (padrão se passar `?scope=me`): apaga "só pra mim" — adiciona
 *   linha em `message_hides`. A mensagem continua existindo pros outros
 *   membros. Não publica SSE (só afeta este usuário).
 * - scope=everyone (DEFAULT — comportamento legado): apaga pra todos,
 *   marcando a mensagem com `deleted=1`. Só funciona se for autor.
 */
export async function DELETE(req, props) {
  const params = await props.params;
  return withErrors(async () => {
    const u = await requireUser();
    const url = new URL(req.url);
    const scope = url.searchParams.get('scope') || 'everyone';
    if (scope === 'me') {
      return ok(hideMessageForUser({ messageId: params.id, userId: u.id }));
    }
    return ok(deleteMessage({ messageId: params.id, userId: u.id }));
  });
}
