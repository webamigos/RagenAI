import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ragenai/common-ui/Table';
import { getFormatter, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { PAGE_STATUS_FILTERS } from '@/features/brain/constants';
import type { KnowledgePageStatus } from '@/features/brain/contracts/brain.types';
import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';
import { getBrainExportSummaryQuery } from '@/features/brain/services/queries/get-brain-export-summary-query';
import { getKnowledgePagesQuery } from '@/features/brain/services/queries/get-knowledge-pages-query';
import { getApprovedPageCountQuery } from '@/features/brain/services/queries/get-approved-page-count-query';
import { listRange, parseListPage } from '@/features/brain/utils/list-page';
import { Link } from '@/i18n/routing';

import { BrainEmpty } from './components/BrainEmpty';
import { BrainPager } from './components/BrainPager';
import { FilterChips } from './components/FilterChips';
import { PublishAllButton } from './components/PublishAllButton';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{
    status?: string | string[];
    page?: string | string[];
  }>;
};

export default async function BrainPagesPage({ searchParams }: Props) {
  const access = await getBrainAccessQuery();
  if (!access) {
    notFound();
  }
  const params = await searchParams;
  const raw = params.status;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const listPage = parseListPage(params.page);
  const status = (PAGE_STATUS_FILTERS as readonly string[]).includes(
    value ?? '',
  )
    ? (value as KnowledgePageStatus)
    : null;

  const [t, format, { items, total }, exportSummary, approved] =
    await Promise.all([
      getTranslations('brain'),
      getFormatter(),
      getKnowledgePagesQuery(access.orgId, status, listPage),
      getBrainExportSummaryQuery(access.orgId),
      getApprovedPageCountQuery(access.orgId),
    ]);
  const skippedReasons = Object.entries(exportSummary.skipped) as [
    string,
    number,
  ][];

  return (
    <section>
      <title>{`${t('tabs.pages')} — ${t('title')}`}</title>
      <FilterChips
        label={t('filters.status')}
        options={[
          {
            key: 'all',
            label: t('filters.all-but-rejected'),
            href: '/brain',
            active: status === null,
          },
          ...PAGE_STATUS_FILTERS.map((s) => ({
            key: s,
            label: t(`page-status.${s}`),
            href: `/brain?status=${s}`,
            active: status === s,
          })),
        ]}
      />

      <div
        className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[6px] border border-border bg-background px-3 py-2 text-xs"
        data-testid="brain-export"
      >
        <span className="font-medium text-foreground">
          {t('export.ready', { count: exportSummary.pages })}
        </span>
        {skippedReasons.map(([reason, count]) => (
          <span key={reason} className="text-muted-foreground">
            {t(`export.skipped.${reason}`, { count })}
          </span>
        ))}
        <span className="ml-auto" />
        <PublishAllButton approved={approved} />
        {exportSummary.pages > 0 ? (
          <a
            href="/api/brain/export"
            download
            className="text-primary underline-offset-4 hover:underline"
          >
            {t('export.download')}
          </a>
        ) : (
          <span className="text-muted-foreground">{t('export.none')}</span>
        )}
      </div>

      {items.length === 0 && listPage === 1 ? (
        <BrainEmpty
          title={t('pages.empty-title')}
          description={t('pages.empty-description')}
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {t('pages.count', {
              shown: listRange(listPage, items.length),
              total,
            })}
          </p>
          <div className="overflow-x-auto">
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('pages.columns.title')}</TableHeader>
                  <TableHeader>{t('pages.columns.type')}</TableHeader>
                  <TableHeader>{t('pages.columns.status')}</TableHeader>
                  <TableHeader>{t('pages.columns.owner')}</TableHeader>
                  <TableHeader className="text-right">
                    {t('pages.columns.documents')}
                  </TableHeader>
                  <TableHeader className="text-right">
                    {t('pages.columns.findings')}
                  </TableHeader>
                  <TableHeader className="text-right">
                    {t('pages.columns.updated')}
                  </TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  // The title is the row's one link (rule 14 of
                  // docs/panel-ux-rules.md). Not `TableRow href`: that puts the
                  // whole cell inside an absolutely positioned link, which is
                  // why a long title spilled over the next column.
                  <TableRow key={item.publicId}>
                    <TableCell className="font-medium">
                      {/*
                        270px, not 360: with seven columns the table needed
                        1105px of the layout's 1072, and `whitespace-nowrap`
                        pushed "Updated" out of view on every width. The
                        title truncates with its full text in `title`.
                      */}
                      <span className="flex max-w-[270px] items-center gap-2">
                        <Link
                          href={`/brain/pages/${item.publicId}`}
                          className="truncate text-primary underline-offset-4 hover:underline"
                          title={item.title}
                        >
                          {item.title}
                        </Link>
                        {item.published && (
                          <Badge variant="outline">
                            {t('pages.published')}
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>{t(`page-type.${item.type}`)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {t(`page-status.${item.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span
                        className="block max-w-[140px] truncate"
                        title={item.ownerName ?? undefined}
                      >
                        {item.ownerName ?? t('pages.no-owner')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.documents}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.openFindings}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {format.dateTime(new Date(item.updatedAt), {
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
          <BrainPager
            page={listPage}
            total={total}
            hrefFor={(n) =>
              `/brain?${new URLSearchParams({
                ...(status ? { status } : {}),
                page: String(n),
              })}`
            }
          />
        </>
      )}
    </section>
  );
}
