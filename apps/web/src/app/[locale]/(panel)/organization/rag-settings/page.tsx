import { getTranslations } from 'next-intl/server';
import type { PropsWihLocale } from '@/app/lib/types/types';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
import { getRagSettingsAction } from './actions';
import { RagSettingsView } from './components/RagSettingsView';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'organization-page' });
  return { title: t('rag-settings.title') };
}

export default async function RagSettingsPage() {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);

  const data = await getRagSettingsAction();

  return (
    <div className="max-w-2xl space-y-8">
      <RagSettingsView data={data} />
    </div>
  );
}
