import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { FINDING_STATUS_FILTERS } from '@/features/brain/constants';
import type { KnowledgeFindingStatus } from '@/features/brain/contracts/brain.types';
import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';
import { getKnowledgeFindingsQuery } from '@/features/brain/services/queries/get-knowledge-findings-query';
import { listRange, parseListPage } from '@/features/brain/utils/list-page';

import { FilterChips } from '../components/FilterChips';
import { BrainEmpty } from '../components/BrainEmpty';
import { BrainPager } from '../components/BrainPager';
import { FindingsTable } from '../components/FindingsTable';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{
    status?: string | string[];
    page?: string | string[];
  }>;
};

export default async function BrainFindingsPage({ searchParams }: Props) {
  const access = await getBrainAccessQuery();
  if (!access) {
    notFound();
  }
  const params = await searchParams;
  const raw = params.status;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const listPage = parseListPage(params.page);
  const status: KnowledgeFindingStatus = (
    FINDING_STATUS_FILTERS as readonly string[]
  ).includes(value ?? '')
    ? (value as KnowledgeFindingStatus)
    : 'OPEN';

  const [t, { items, total }] = await Promise.all([
    getTranslations('brain'),
    getKnowledgeFindingsQuery(access.orgId, status, listPage),
  ]);

  return (
    <section>
      <title>{`${t('tabs.findings')} — ${t('title')}`}</title>
      <FilterChips
        label={t('filters.status')}
        options={FINDING_STATUS_FILTERS.map((s) => ({
          key: s,
          label: t(`findings.status.${s}`),
          href:
            s === 'OPEN' ? '/brain/findings' : `/brain/findings?status=${s}`,
          active: status === s,
        }))}
      />
      {items.length === 0 && listPage === 1 ? (
        <BrainEmpty
          title={t('findings.empty-title')}
          description={t('findings.empty-description')}
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {t('findings.count', {
              shown: listRange(listPage, items.length),
              total,
            })}
          </p>
          <FindingsTable items={items} />
          <BrainPager
            page={listPage}
            total={total}
            hrefFor={(n) =>
              `/brain/findings?${new URLSearchParams({
                ...(status === 'OPEN' ? {} : { status }),
                page: String(n),
              })}`
            }
          />
        </>
      )}
    </section>
  );
}
