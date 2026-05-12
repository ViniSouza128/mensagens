import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth';
import AppShell from '@/components/layout/AppShell';
import { AppStateProvider } from '@/store/AppStateProvider';

export const dynamic = 'force-dynamic';

const ME_FIELDS = [
  'id','username','email','name','bio','avatar_path',
  'is_admin','status','onboarded',
  'privacy_last_seen','privacy_avatar','privacy_bio',
  'read_receipts','block_unknown','notify_messages','notify_groups',
  'sound_enabled','send_with_enter',
  'theme','accent','font_size','media_quality','auto_download','wallpaper',
  'created_at',
];

export default async function AppLayout({ children }) {
  const u = await getCurrentUser();
  if (!u) redirect('/login');
  if (!u.onboarded) redirect('/onboarding');
  const initialUser = {};
  for (const f of ME_FIELDS) initialUser[f] = u[f];
  initialUser.is_admin = !!u.is_admin;
  initialUser.read_receipts = !!u.read_receipts;
  initialUser.block_unknown = !!u.block_unknown;
  initialUser.notify_messages = !!u.notify_messages;
  initialUser.notify_groups = !!u.notify_groups;
  initialUser.sound_enabled = !!u.sound_enabled;
  initialUser.send_with_enter = !!u.send_with_enter;
  initialUser.onboarded = !!u.onboarded;
  return (
    <AppStateProvider initialUser={initialUser}>
      <AppShell>{children}</AppShell>
    </AppStateProvider>
  );
}
