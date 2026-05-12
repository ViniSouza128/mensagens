import { ok, withErrors } from '@/server/http';
import { getCurrentUser } from '@/server/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PUBLIC_FIELDS = [
  'id', 'username', 'email', 'name', 'bio', 'avatar_path',
  'is_admin', 'status', 'onboarded',
  'privacy_last_seen', 'privacy_avatar', 'privacy_bio',
  'read_receipts', 'block_unknown', 'notify_messages', 'notify_groups',
  'sound_enabled', 'send_with_enter',
  'theme', 'accent', 'font_size', 'media_quality', 'auto_download', 'wallpaper',
  'created_at',
];

export async function GET() {
  return withErrors(async () => {
    const u = await getCurrentUser();
    if (!u) return ok(null);
    const out = {};
    for (const f of PUBLIC_FIELDS) out[f] = u[f];
    out.is_admin = !!u.is_admin;
    out.read_receipts = !!u.read_receipts;
    out.block_unknown = !!u.block_unknown;
    out.notify_messages = !!u.notify_messages;
    out.notify_groups = !!u.notify_groups;
    out.sound_enabled = !!u.sound_enabled;
    out.send_with_enter = !!u.send_with_enter;
    out.onboarded = !!u.onboarded;
    return ok(out);
  });
}
