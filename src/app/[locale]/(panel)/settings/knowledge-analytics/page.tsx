import type { Metadata } from 'next';
import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';
import { requireOrgAdmin } from '@/lib/auth-guards';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { KnowledgeAnalyticsDashboard } from './components/KnowledgeAnalyticsDashboard';

export const metadata: Metadata = {
  title: 'Knowledge Analytics',
};

export default async function KnowledgeAnalyticsPage() {
  const [locale, orgId] = await Promise.all([getLocale(), getOrgIdFromAuth()]);

  if (!orgId) {
    return redirect({ href: '/', locale });
  }

  try {
    await requireOrgAdmin(orgId);
  } catch {
    return redirect({ href: '/', locale });
  }

  return (
    <div className="p-6">
      <KnowledgeAnalyticsDashboard />
    </div>
  );
}
