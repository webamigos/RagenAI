import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';
import { getBrainReviewQueueQuery } from '@/features/brain/services/queries/get-brain-review-queue-query';
import { getKnowledgePageQuery } from '@/features/brain/services/queries/get-knowledge-page-query';
import { getBrainReviewOptionsQuery } from '@/features/brain/services/queries/get-brain-review-options-query';
import { getBrainDocumentsQuery } from '@/features/brain/services/queries/get-brain-documents-query';
import { getBrainStatusCountsQuery } from '@/features/brain/services/queries/get-brain-status-counts-query';
import { getBrainLanguageScopeQuery } from '@/features/brain/services/queries/brain-language-scope';
import { getEffectiveFeaturesQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import { parseBrainLanguage } from '@/features/brain/contracts/brain-language.types';
import { dbUuid } from '@/features/brain/contracts/brain-review.types';
import { BrainReviewMode } from '../components/BrainReviewMode';
export const dynamic = 'force-dynamic';
export default async function BrainReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[]; lang?: string | string[] }>;
}) {
  const access = await getBrainAccessQuery();
  if (!access) {
    notFound();
  }
  const params = await searchParams;
  const language = parseBrainLanguage(params.lang);
  const requested = Array.isArray(params.page) ? params.page[0] : params.page;
  if (requested && !dbUuid.safeParse(requested).success) {
    notFound();
  }
  const scope = await getBrainLanguageScopeQuery(access.orgId, language);
  const [queue, options, documents, counts, features, t] = await Promise.all([
    getBrainReviewQueueQuery(access.orgId, language),
    getBrainReviewOptionsQuery(access.orgId),
    getBrainDocumentsQuery(access.orgId),
    getBrainStatusCountsQuery(access.orgId, scope),
    getEffectiveFeaturesQuery(access.orgId),
    getTranslations('brain'),
  ]);
  const publicId = requested ?? queue[0]?.publicId;
  const page = publicId
    ? await getKnowledgePageQuery(access.orgId, publicId)
    : null;
  if (requested && !page) {
    notFound();
  }
  return (
    <>
      <title>{t('review-mode.title')}</title>
      <BrainReviewMode
        queue={queue}
        page={page}
        members={options.members}
        candidateCounts={Object.fromEntries(
          documents.map((file) => [file.fileId, file.candidatePages]),
        )}
        language={language}
        canWrite={access.canWrite}
        warningsEnabled={features.brainParaphraseWarnings}
        progress={{
          reviewed: counts.pages.APPROVED + counts.pages.REJECTED,
          total: Object.values(counts.pages).reduce(
            (sum, value) => sum + value,
            0,
          ),
        }}
      />
    </>
  );
}
