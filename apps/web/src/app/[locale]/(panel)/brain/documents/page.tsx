import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ragenai/common-ui/Table';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';
import { parseBrainLanguage } from '@/features/brain/contracts/brain-language.types';
import { getBrainDocumentsQuery } from '@/features/brain/services/queries/get-brain-documents-query';
import { languageName } from '@/features/brain/utils/language-name';

import { BrainEmpty } from '../components/BrainEmpty';
import { BrainUploadButton } from '../components/BrainUploadButton';
import { DocumentRetrievalActions } from '../components/DocumentRetrievalActions';
import { BrainScreen } from '../components/assistant/BrainAssistantContext';

export const dynamic = 'force-dynamic';

/**
 * The organization's documents from Brain's side (spec E9): which ones its
 * pages have curated, and — once they have — the per-document choice to take
 * a document out of retrieval so answers come from the reviewed pages alone.
 * Never automatic, always reversible.
 */
type Props = {
  searchParams: Promise<{ lang?: string | string[] }>;
};

export default async function BrainDocumentsPage({ searchParams }: Props) {
  const access = await getBrainAccessQuery();
  if (!access) {
    notFound();
  }
  const language = parseBrainLanguage((await searchParams).lang);
  const [t, format, documents, locale] = await Promise.all([
    getTranslations('brain.documents'),
    getFormatter(),
    getBrainDocumentsQuery(access.orgId, language),
    getLocale(),
  ]);
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
    <section>
      <BrainScreen context={{ view: 'documents', selectedFileIds: [] }} />
      <title>{t('title')}</title>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[720px] text-xs text-muted-foreground">
          {t('intro')}
        </p>
        {access.canWrite && <BrainUploadButton />}
      </div>
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
        <div className="overflow-x-auto">
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>{t('columns.document')}</TableHeader>
                <TableHeader className="text-right">
                  {t('columns.approved')}
                </TableHeader>
                <TableHeader className="text-right">
                  {t('columns.candidates')}
                </TableHeader>
                <TableHeader>{t('columns.language')}</TableHeader>
                <TableHeader>{t('columns.retrieval')}</TableHeader>
                {access.canWrite && (
                  <TableHeader className="text-right">
                    {t('columns.actions')}
                  </TableHeader>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {documents.map((d) => (
                <TableRow key={d.fileId} data-testid="brain-document-row">
                  <TableCell className="font-medium">
                    {/*
                      Truncated, with the full name in `title`: the table is
                      `whitespace-nowrap`, so one long file name widened the
                      whole table past the 1072px the layout gives it and
                      pushed the actions column out of view.
                    */}
                    <span
                      className="block max-w-[320px] truncate"
                      title={d.fileName}
                    >
                      {d.fileName}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.approvedPages}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.candidatePages}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {d.language
                      ? languageName(d.language, locale)
                      : t('language-none')}
                  </TableCell>
                  <TableCell>{t(`retrieval.${d.retrieval}`)}</TableCell>
                  {access.canWrite && (
                    <TableCell className="text-right">
                      <DocumentRetrievalActions
                        fileId={d.fileId}
                        fileName={d.fileName}
                        retrieval={d.retrieval}
                        curated={d.approvedPages > 0}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
