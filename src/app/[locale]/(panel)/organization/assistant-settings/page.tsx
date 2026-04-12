import { getTranslations } from 'next-intl/server';

import type { PropsWihLocale } from '@/app/lib/types/types';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
import db from '@ragenai/prisma-client';
import { OrganizationProfileForm } from '../profile/components/OrganizationProfileForm';

import PromptManagementPage from './PromptManagementPageWrapper';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('prompt-management.title'),
  };
}

export default async function SettingsPage() {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true },
  });

  const t = await getTranslations('organization-page');

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white mb-4">
          {t('general-settings')}
        </h2>
        {org && <OrganizationProfileForm organization={org} canEdit={true} />}
      </section>
      <hr className="border-zinc-200 dark:border-zinc-800" />
      <PromptManagementPage />
    </div>
  );
}
