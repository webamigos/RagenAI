import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import type { PropsWihLocale } from '@/app/lib/types/types';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
import {
  getContextualChunksAction,
  getOrgMemoryAction,
  getRagSettingsAction,
} from './actions';
import { ContextualChunksSection } from './components/ContextualChunksSection';
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
      <hr className="border-border" />
      {/* Streamed: counting reads the whole collection from Qdrant, which
          must not hold up the rest of the page. */}
      <Suspense fallback={<ContextualChunksPending />}>
        <ContextualChunks />
      </Suspense>
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

async function ContextualChunks() {
  return <ContextualChunksSection data={await getContextualChunksAction()} />;
}

async function ContextualChunksPending() {
  const t = await getTranslations('organization-page.rag-settings');
  return (
    <section aria-busy="true">
      <h3 className="text-sm font-semibold text-foreground">
        {t('contextual-title')}
      </h3>
      <p className="mt-3 text-sm text-muted-foreground">
        {t('contextual-counting')}
      </p>
    </section>
  );
}
