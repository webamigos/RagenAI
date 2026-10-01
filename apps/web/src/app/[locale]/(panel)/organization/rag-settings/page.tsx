import { getTranslations } from 'next-intl/server';
import type { PropsWihLocale } from '@/app/lib/types/types';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
import { getOrgMemoryAction, getRagSettingsAction } from './actions';
import { OrgMemorySection } from './components/OrgMemorySection';
import { RagSettingsView } from './components/RagSettingsView';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'organization-page' });
  return { title: t('rag-settings.title') };
}

export default async function RagSettingsPage() {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);

  const [data, orgMemory] = await Promise.all([
    getRagSettingsAction(),
    getOrgMemoryAction(),
  ]);

  return (
    <div className="max-w-2xl space-y-8">
      <RagSettingsView data={data} />
      {/* Personal memory, B3: shown while the feature is on, or while
          members' memories remain after it was turned off. */}
      {(orgMemory.enabled || orgMemory.hasMemories) && (
        <>
          <hr className="border-border" />
          <OrgMemorySection data={orgMemory} />
        </>
      )}
    </div>
  );
}
