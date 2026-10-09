import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';
import { getBrainOverviewQuery } from '@/features/brain/services/queries/get-brain-overview-query';
import { parseBrainLanguage } from '@/features/brain/contracts/brain-language.types';
import { BrainOverviewPanel } from '../components/BrainOverviewPanel';
import { BrainScreen } from '../components/assistant/BrainAssistantContext';
export const dynamic = 'force-dynamic';
export default async function BrainOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  const access = await getBrainAccessQuery();
  if (!access) {
    notFound();
  }
  const language = parseBrainLanguage((await searchParams).lang);
  const [t, data] = await Promise.all([
    getTranslations('brain'),
    getBrainOverviewQuery(access.orgId, language),
  ]);
  return (
    <section>
      <title>{`${t('tabs.overview')} – ${t('title')}`}</title>
      <BrainScreen context={{ view: 'overview' }} />
      <BrainOverviewPanel
        data={data}
        language={language}
        canWrite={access.canWrite}
      />
    </section>
  );
}
