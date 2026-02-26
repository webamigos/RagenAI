import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { DiskUsageSettings } from './components/DiskUsageSettings';

export default async function DiskUsagePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/sign-in');
  }

  // Only app admins can access this page
  if (user.role !== 'admin') {
    redirect('/');
  }

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold mb-6">Disk Usage</h1>
      <DiskUsageSettings />
    </div>
  );
}
