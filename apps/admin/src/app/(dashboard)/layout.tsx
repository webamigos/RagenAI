import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth-guard';
import { DashboardShell } from './DashboardShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A session alone does not grant access — `users` is shared with apps/web,
  // so the role check in getAdminUser() is what separates a platform
  // administrator from an ordinary customer account.
  const admin = await getAdminUser();

  if (!admin) {
    redirect('/login?error=forbidden');
  }

  return <DashboardShell>{children}</DashboardShell>;
}
