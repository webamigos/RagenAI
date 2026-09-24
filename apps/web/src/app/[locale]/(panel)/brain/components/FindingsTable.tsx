import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ragenai/common-ui/Table';
import { getFormatter, getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import type { KnowledgeFindingListItem } from '@/features/brain/contracts/brain.types';
import { Link } from '@/i18n/routing';

import { FindingSummaryView } from './FindingSummaryView';
import { RetryExtractionButton } from './RetryExtractionButton';

/**
 * Findings as rows. The row is not a link: a contradiction names two pages,
 * and rule 14 of `docs/panel-ux-rules.md` gives a row one click target, so
 * each page is its own link in the subject cell.
 */
export async function FindingsTable({
  items,
  showSubject = true,
  canWrite = true,
  focusedId = null,
  assistant = false,
}: {
  items: KnowledgeFindingListItem[];
  showSubject?: boolean;
  /** False in read-only mode: the retry control is a curator's. */
  canWrite?: boolean;
  /** The finding on the assistant's screen, marked as the current row. */
  focusedId?: string | null;
  /** The assistant is on: each row can be put on its screen. */
  assistant?: boolean;
}) {
  const [t, format] = await Promise.all([
    getTranslations('brain.findings'),
    getFormatter(),
  ]);

  return (
    <div className="overflow-x-auto">
      <Table dense>
        <TableHead>
          <TableRow>
            <TableHeader>{t('columns.type')}</TableHeader>
            {showSubject && <TableHeader>{t('columns.subject')}</TableHeader>}
            <TableHeader>{t('columns.detail')}</TableHeader>
            <TableHeader>{t('columns.severity')}</TableHeader>
            <TableHeader className="text-right">
              {t('columns.detected')}
            </TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow
              key={item.publicId}
              id={`finding-${item.publicId}`}
              data-testid="brain-finding-row"
              aria-current={item.publicId === focusedId ? 'true' : undefined}
              className={item.publicId === focusedId ? 'bg-muted' : undefined}
            >
              <TableCell className="align-top font-medium">
                {t(`type.${item.type}`)}
              </TableCell>
              {showSubject && (
                <TableCell className="align-top whitespace-normal">
                  <ul className="space-y-0.5">
                    {item.pages.map((page) => (
                      <li key={page.publicId}>
                        <Link
                          href={`/brain/pages/${page.publicId}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {page.title}
                        </Link>
                      </li>
                    ))}
                    {item.file && (
                      <li className="text-muted-foreground">
                        {item.file.documentId ? (
                          <Link
                            href={`/knowledge/documents/${item.file.documentId}`}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {item.file.name}
                          </Link>
                        ) : (
                          item.file.name
                        )}
                      </li>
                    )}
                  </ul>
                </TableCell>
              )}
              <TableCell className="max-w-[480px] align-top whitespace-normal">
                <FindingSummaryView summary={item.summary} />
                {assistant && item.publicId !== focusedId && (
                  <Link
                    href={`/brain/findings?finding=${item.publicId}#finding-${item.publicId}`}
                    data-testid="brain-finding-discuss"
                    className="mt-1.5 inline-block text-xs text-primary underline-offset-4 hover:underline"
                  >
                    {t('discuss')}
                  </Link>
                )}
                {canWrite &&
                  item.type === 'EXTRACTION_FAILED' &&
                  item.status === 'OPEN' && (
                    <div className="mt-1.5">
                      <RetryExtractionButton findingPublicId={item.publicId} />
                    </div>
                  )}
              </TableCell>
              <TableCell className="align-top">
                <Badge variant="outline">
                  {t(`severity.${item.severity}`)}
                </Badge>
              </TableCell>
              <TableCell className="text-right align-top tabular-nums text-muted-foreground">
                {format.dateTime(new Date(item.detectedAt), {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
