import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth-guard';
import { readQueueDashboardUrl } from '@/config/env';
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

  // Read here rather than in the client component: a `NEXT_PUBLIC_` variable
  // would be inlined at build time, so an operator setting this on a deployed
  // container would see the link render and then disappear on hydration.
  //
  // Through the read boundary rather than off `process.env`, because the value
  // becomes an `href`: `readQueueDashboardUrl` drops a url that is malformed or
  // carries credentials instead of rendering it.
  return (
    <DashboardShell queueDashboardUrl={readQueueDashboardUrl()}>
      {children}
    </DashboardShell>
  );
}
