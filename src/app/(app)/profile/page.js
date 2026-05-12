import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

export default async function ProfileRoot() {
  const u = await getCurrentUser();
  if (!u) redirect('/login');
  redirect(`/profile/${u.username}`);
}
