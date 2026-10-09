import { TouchTarget } from '@ragenai/common-ui/TouchTarget';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ragenai/common-ui/Table';
import type { BrainDocument } from '@/features/brain/contracts/brain-documents.types';
import type { BrainDocumentExtraction } from '@/features/brain/contracts/brain-document-extraction.types';
import {
  documentExtractionState,
  summarizeBrainDocuments,
} from '@/features/brain/utils/document-summary';
import { languageName } from '@/features/brain/utils/language-name';
import { Link } from '@/i18n/routing';
import { DocumentRowMenu } from './DocumentRowMenu';

export function BrainDocumentsPanel({
  documents,
  extraction,
  locale,
  canWrite,
}: {
  documents: BrainDocument[];
  extraction: ReadonlyMap<string, BrainDocumentExtraction>;
  locale: string;
  canWrite: boolean;
}) {
  const t = useTranslations('brain.documents');
  const summary = summarizeBrainDocuments(documents, extraction, locale);
  // Only what needs attention, and only when there is some: two tiles
  // reading "0" on most visits were a status nobody had to act on.
  const warnings = [
    { key: 'empty', count: summary.empty },
    { key: 'withdrawn', count: summary.withdrawn },
  ].filter((w) => w.count > 0);
  return (
    <div className="space-y-4" data-testid="brain-documents-panel">
      {warnings.length > 0 && (
        <ul
          role="status"
          data-testid="brain-documents-warnings"
          className="flex flex-wrap gap-x-6 gap-y-1 rounded-[6px] border border-pending bg-pending-tint px-3 py-2 text-sm text-foreground"
        >
          {warnings.map((w) => (
            <li key={w.key} data-testid={`documents-warning-${w.key}`}>
              {t(`warnings.${w.key}`, { count: w.count })}
            </li>
          ))}
        </ul>
      )}
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3 border-b py-4 sm:flex-row">
          <div className="space-y-1">
            <CardTitle
              role="heading"
              aria-level={3}
              className="text-base"
              data-testid="brain-documents-count"
            >
              {t('table-title', { count: documents.length })}
            </CardTitle>
            {/*
              Brain's view of the files, not a second file manager: uploads,
              folders and deletion live in the knowledge base.
            */}
            <Link
              href="/knowledge/documents-list"
              className="relative inline-block text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <TouchTarget>{t('manage-in-knowledge-base')}</TouchTarget>
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm bg-ready"
              />
              {t('columns.approved')}
            </span>
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm bg-primary/25"
              />
              {t('columns.candidates')}
            </span>
            <span>{t('shared-scale', { count: summary.maxPages })}</span>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table dense className="min-w-[760px] whitespace-normal">
            <TableHead>
              <TableRow className="bg-muted/40">
                <TableHeader>{t('columns.document')}</TableHeader>
                <TableHeader className="text-right">
                  {t('columns.coverage')}
                </TableHeader>
                <TableHeader>{t('columns.state')}</TableHeader>
                {canWrite && (
                  <TableHeader className="w-12">
                    <span className="sr-only">{t('columns.actions')}</span>
                  </TableHeader>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {summary.documents.map((document) => {
                const evidence = extraction.get(document.fileId);
                const state = documentExtractionState(document, evidence);
                let variant: 'ready' | 'pending' | 'destructive' | 'outline' =
                  'outline';
                if (state === 'failed' || state === 'empty') {
                  variant = 'destructive';
                } else if (state === 'processing') {
                  variant = 'pending';
                } else if (state === 'extracted') {
                  variant = 'ready';
                }
                return (
                  <TableRow
                    key={document.fileId}
                    data-testid="brain-document-row"
                  >
                    <TableCell className="max-w-[300px] whitespace-normal">
                      <span className="block break-words text-sm font-medium [overflow-wrap:anywhere]">
                        {document.fileName}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {document.language
                          ? languageName(document.language, locale)
                          : t('language-none')}
                      </span>
                      {document.pair && (
                        <span
                          className="mt-1 block break-words text-xs text-muted-foreground [overflow-wrap:anywhere]"
                          data-testid="brain-document-pair"
                        >
                          {t('pair-with', {
                            name: document.pair.fileName,
                            language: document.pair.language
                              ? languageName(document.pair.language, locale)
                              : t('language-none'),
                          })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="w-[280px] min-w-[220px]">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 100 3"
                        preserveAspectRatio="none"
                        className="h-2 w-full overflow-hidden rounded-sm"
                      >
                        <rect width="100" height="3" className="fill-muted" />
                        <rect
                          data-segment="approved"
                          width={
                            (document.approvedPages / summary.maxPages) * 100
                          }
                          height="3"
                          className="fill-ready"
                        />
                        <rect
                          data-segment="candidates"
                          x={(document.approvedPages / summary.maxPages) * 100}
                          width={
                            (document.candidatePages / summary.maxPages) * 100
                          }
                          height="3"
                          className="fill-primary/25"
                        />
                      </svg>
                      <span className="mt-1 block text-right text-xs tabular-nums text-muted-foreground">
                        {t('coverage-counts', {
                          approved: document.approvedPages,
                          candidates: document.candidatePages,
                        })}
                      </span>
                      {document.pair && (
                        <span className="mt-1 block text-right text-xs tabular-nums text-muted-foreground">
                          {t('pair-coverage', {
                            approved: document.pair.approvedPages,
                            candidates: document.pair.candidatePages,
                          })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {/*
                        One badge: whether Brain read it and, only when the
                        file is kept out of search (staged or withdrawn),
                        that too. Processing and failure are already the
                        state.
                      */}
                      <Badge variant={variant} className="whitespace-normal">
                        {document.retrieval !== 'staged' &&
                        document.retrieval !== 'withdrawn'
                          ? t(`state.${state}`)
                          : t('state-with-retrieval', {
                              state: t(`state.${state}`),
                              retrieval: t(`retrieval.${document.retrieval}`),
                            })}
                      </Badge>
                      {document.language === null && (
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {t('check-language')}
                        </span>
                      )}
                    </TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <DocumentRowMenu
                          fileId={document.fileId}
                          fileName={document.fileName}
                          retrieval={document.retrieval}
                          curated={document.approvedPages > 0}
                          failedExtraction={evidence?.failure?.publicId ?? null}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
