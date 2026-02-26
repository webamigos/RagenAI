import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { AiUsageDashboard } from './components/AiUsageDashboard';

export default async function AiUsagePage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);

  if (!user) {
    return redirect({ href: '/sign-in', locale });
  }

  if (user.role !== 'admin') {
    return redirect({ href: '/', locale });
  }

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">AI Usage</h1>
      <AiUsageDashboard />
    </div>
  );
}
