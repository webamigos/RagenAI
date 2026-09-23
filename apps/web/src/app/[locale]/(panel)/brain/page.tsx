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
import { getKnowledgePagesQuery } from '@/features/brain/services/queries/get-knowledge-pages-query';
import { Link } from '@/i18n/routing';

import { BrainEmpty } from './components/BrainEmpty';
import { FilterChips } from './components/FilterChips';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ status?: string | string[] }> };

export default async function BrainPagesPage({ searchParams }: Props) {
  const access = await getBrainAccessQuery();
  if (!access) {
    notFound();
  }
  const raw = (await searchParams).status;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const status = (PAGE_STATUS_FILTERS as readonly string[]).includes(
    value ?? '',
  )
    ? (value as KnowledgePageStatus)
    : null;

  const [t, format, { items, total }] = await Promise.all([
    getTranslations('brain'),
    getFormatter(),
    getKnowledgePagesQuery(access.orgId, status),
  ]);

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

      {items.length === 0 ? (
        <BrainEmpty
          title={t('pages.empty-title')}
          description={t('pages.empty-description')}
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {t('pages.count', { shown: items.length, total })}
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
                      <span className="flex max-w-[360px] items-center gap-2">
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
                      {item.ownerName ?? t('pages.no-owner')}
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
        </>
      )}
    </section>
  );
}
