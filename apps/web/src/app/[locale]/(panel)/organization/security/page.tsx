import { getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { getLocale } from 'next-intl/server';
import { getCurrentUser, getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { getActiveMember } from '@/lib/auth-guards';
import { isAppAdmin, canManageOrg } from '@/lib/auth-access-control';
import { listSecurityEventsQuery } from '@/features/security/services/queries/list-security-events-query';
import type { SecurityEventFilters } from '@/features/security/contracts/security-event.types';
import { SecurityEventsTable } from './components/SecurityEventsTable';

export async function generateMetadata() {
  const t = await getTranslations('Metadata');
  return { title: t('settings-security.title') };
}

type SearchParams = {
  page?: string;
  severity?: string;
  eventType?: string;
  resolved?: string;
  period?: string;
};

export default async function SecuritySettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);

  if (!user) {
    return redirect({ href: '/sign-in', locale });
  }

  const orgId = await getOrgIdFromAuth();
  if (!orgId) {
    return redirect({ href: '/', locale });
  }

  // App admins always see the page; org members need admin role.
  if (!isAppAdmin(user)) {
    const member = await getActiveMember(orgId);
    if (!member || !canManageOrg(member.role)) {
      return redirect({ href: '/settings/general', locale });
    }
  }

  const params = await searchParams;
  const t = await getTranslations('settings-security');

  const parseResolved = (v: string | undefined): boolean | undefined => {
    if (v === 'true') {
      return true;
    }
    if (v === 'false') {
      return false;
    }
    return undefined;
  };

  const filters: SecurityEventFilters = {
    organizationId: orgId,
    page: Math.max(1, Number(params.page) || 1),
    pageSize: 25,
    severity:
      params.severity === 'info' ||
      params.severity === 'warn' ||
      params.severity === 'critical'
        ? params.severity
        : undefined,
    resolved: parseResolved(params.resolved),
    period:
      params.period === '1d' ||
      params.period === '7d' ||
      params.period === '30d'
        ? params.period
        : '7d',
  };

  const result = await listSecurityEventsQuery(filters);

  return (
    <div className="max-w-5xl space-y-4">
      <section>
        <h2 className="text-base font-semibold text-foreground dark:text-white">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </section>
      <SecurityEventsTable result={result} filters={filters} />
    </div>
  );
}
