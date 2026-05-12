import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.onboarded) redirect('/onboarding');
  redirect('/chats');
}
