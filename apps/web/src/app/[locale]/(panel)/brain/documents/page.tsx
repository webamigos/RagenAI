import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';
import { parseBrainLanguage } from '@/features/brain/contracts/brain-language.types';
import { getBrainDocumentsQuery } from '@/features/brain/services/queries/get-brain-documents-query';
import { Link } from '@/i18n/routing';
import { withLanguage } from '@/features/brain/utils/with-language';
import { getBrainDocumentExtractionQuery } from '@/features/brain/services/queries/get-brain-document-extraction-query';

import { BrainEmpty } from '../components/BrainEmpty';
import { BrainUploadButton } from '../components/BrainUploadButton';
import { BrainDocumentsPanel } from '../components/BrainDocumentsPanel';
import { BrainScreen } from '../components/assistant/BrainAssistantContext';

export const dynamic = 'force-dynamic';

/**
 * The organization's documents from Brain's side (spec E9): which ones its
 * pages have curated, and — once they have — the per-document choice to take
 * a document out of retrieval so answers come from the reviewed pages alone.
 * Never automatic, always reversible.
 */
type Props = {
  searchParams: Promise<{
    lang?: string | string[];
    coverage?: string | string[];
  }>;
};

export default async function BrainDocumentsPage({ searchParams }: Props) {
  const access = await getBrainAccessQuery();
  if (!access) {
    notFound();
  }
  const params = await searchParams;
  const language = parseBrainLanguage(params.lang);
  const emptyOnly = params.coverage === 'empty';
  const [t, format, documents, locale] = await Promise.all([
    getTranslations('brain.documents'),
    getFormatter(),
    getBrainDocumentsQuery(access.orgId, language, emptyOnly),
    getLocale(),
  ]);
  const extraction = await getBrainDocumentExtractionQuery(
    access.orgId,
    documents.map((document) => document.fileId),
  );
  const staged = documents.filter((d) => d.retrieval === 'staged');
  // How long the oldest has waited (spec F4): staging is a "not yet", and a
  // "not yet" of three months is a decision nobody made.
  const oldestStaged = staged.reduce<string | null>(
    (oldest, d) =>
      d.uploadedAt && (oldest === null || d.uploadedAt < oldest)
        ? d.uploadedAt
        : oldest,
    null,
  );

  return (
    <section className="space-y-4" data-panel-fullwidth>
      <BrainScreen context={{ view: 'documents', selectedFileIds: [] }} />
      <title>{t('title')}</title>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-semibold">
            {t('screen-title')}
          </h2>
          <p className="max-w-[720px] text-sm text-muted-foreground">
            {t('screen-intro')}
          </p>
        </div>
        {access.canWrite && <BrainUploadButton />}
      </div>
      {emptyOnly && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('empty-filter')}</span>
          <Link
            className="text-primary underline underline-offset-4"
            href={withLanguage('/brain/documents', language)}
          >
            {t('clear-filter')}
          </Link>
        </div>
      )}
      {staged.length > 0 && (
        <p
          className="mb-3 text-xs text-foreground"
          data-testid="brain-staged-summary"
        >
          {t('staged-summary', {
            count: staged.length,
            uncurated: staged.filter((d) => d.approvedPages === 0).length,
          })}
          {oldestStaged && (
            <span className="text-muted-foreground">
              {' · '}
              {t('staged-oldest', {
                when: format.relativeTime(new Date(oldestStaged)),
              })}
            </span>
          )}
        </p>
      )}
      {documents.length === 0 ? (
        <BrainEmpty
          title={t(language ? 'empty-in-language-title' : 'empty-title')}
          description={t(
            language ? 'empty-in-language-description' : 'empty-description',
          )}
        />
      ) : (
        <BrainDocumentsPanel
          documents={documents}
          extraction={extraction}
          locale={locale}
          canWrite={access.canWrite}
        />
      )}
    </section>
  );
}
