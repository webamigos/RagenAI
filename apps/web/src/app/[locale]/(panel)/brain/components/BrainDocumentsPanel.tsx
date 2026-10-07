import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { RetryExtractionButton } from './RetryExtractionButton';
import { DocumentRetrievalActions } from './DocumentRetrievalActions';

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
  const stats = [
    { key: 'documents', count: documents.length },
    { key: 'empty', count: summary.empty },
    { key: 'withdrawn', count: summary.withdrawn },
  ] as const;
  return (
    <div className="space-y-4" data-testid="brain-documents-panel">
      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <Card
            className="py-0"
            key={stat.key}
            data-testid={`documents-summary-${stat.key}`}
          >
            <CardContent className="space-y-2 px-3 py-4 sm:px-6">
              <p className="text-[13px] text-muted-foreground sm:text-sm">
                {t(`summary.${stat.key}`)}
              </p>
              <strong className="block font-display text-3xl tabular-nums">
                {stat.count}
              </strong>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3 border-b py-4 sm:flex-row">
          <CardTitle role="heading" aria-level={3} className="text-base">
            {t('table-title')}
          </CardTitle>
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
                <TableHeader className="font-display text-[11px] uppercase">
                  {t('columns.document')}
                </TableHeader>
                <TableHeader className="text-right font-display text-[11px] uppercase">
                  {t('columns.coverage')}
                </TableHeader>
                <TableHeader className="font-display text-[11px] uppercase">
                  {t('columns.state')}
                </TableHeader>
                {canWrite && (
                  <TableHeader className="text-right font-display text-[11px] uppercase">
                    {t('columns.actions')}
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
                      <Badge variant={variant}>{t(`state.${state}`)}</Badge>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {t(`retrieval.${document.retrieval}`)}
                      </span>
                      {document.language === null && (
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {t('check-language')}
                        </span>
                      )}
                    </TableCell>
                    {canWrite && (
                      <TableCell>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {evidence?.failure && (
                            <RetryExtractionButton
                              findingPublicId={evidence.failure.publicId}
                              label={t('retry-extraction')}
                            />
                          )}
                          <DocumentRetrievalActions
                            fileId={document.fileId}
                            fileName={document.fileName}
                            retrieval={document.retrieval}
                            curated={document.approvedPages > 0}
                          />
                        </div>
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
