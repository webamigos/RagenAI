import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ragenai/common-ui/Table';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';
import { getBrainDocumentsQuery } from '@/features/brain/services/queries/get-brain-documents-query';

import { BrainEmpty } from '../components/BrainEmpty';
import { DocumentRetrievalActions } from '../components/DocumentRetrievalActions';

export const dynamic = 'force-dynamic';

/**
 * The organization's documents from Brain's side (spec E9): which ones its
 * pages have curated, and — once they have — the per-document choice to take
 * a document out of retrieval so answers come from the reviewed pages alone.
 * Never automatic, always reversible.
 */
export default async function BrainDocumentsPage() {
  const access = await getBrainAccessQuery();
  if (!access) {
    notFound();
  }
  const [t, documents] = await Promise.all([
    getTranslations('brain.documents'),
    getBrainDocumentsQuery(access.orgId),
  ]);

  return (
    <section>
      <title>{t('title')}</title>
      <p className="mb-3 max-w-[720px] text-xs text-muted-foreground">
        {t('intro')}
      </p>
      {documents.length === 0 ? (
        <BrainEmpty
          title={t('empty-title')}
          description={t('empty-description')}
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
                <TableHeader>{t('columns.retrieval')}</TableHeader>
                <TableHeader className="text-right">
                  {t('columns.actions')}
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {documents.map((d) => (
                <TableRow key={d.fileId} data-testid="brain-document-row">
                  <TableCell className="font-medium">{d.fileName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.approvedPages}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.candidatePages}
                  </TableCell>
                  <TableCell>{t(`retrieval.${d.retrieval}`)}</TableCell>
                  <TableCell className="text-right">
                    <DocumentRetrievalActions
                      fileId={d.fileId}
                      fileName={d.fileName}
                      retrieval={d.retrieval}
                      curated={d.approvedPages > 0}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
