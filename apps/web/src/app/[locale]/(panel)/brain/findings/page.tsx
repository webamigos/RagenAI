import { getTranslations } from 'next-intl/server';
import { withFindingType } from '@/features/brain/utils/page-filters';
import { Link } from '@/i18n/routing';
import { notFound } from 'next/navigation';
import { parseBrainLanguage } from '@/features/brain/contracts/brain-language.types';
import { getBrainLanguageScopeQuery } from '@/features/brain/services/queries/brain-language-scope';
import { withLanguage } from '@/features/brain/utils/with-language';

import {
  FINDING_STATUS_FILTERS,
  FINDING_TYPE_FILTERS,
} from '@/features/brain/constants';
import type {
  KnowledgeFindingStatus,
  KnowledgeFindingType,
} from '@/features/brain/contracts/brain.types';
import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';
import { getKnowledgeFindingsQuery } from '@/features/brain/services/queries/get-knowledge-findings-query';
import { getBrainStatusCountsQuery } from '@/features/brain/services/queries/get-brain-status-counts-query';
import { listRange, parseListPage } from '@/features/brain/utils/list-page';

import { dbUuid } from '@/features/brain/contracts/brain-review.types';

import { BrainScreen } from '../components/assistant/BrainAssistantContext';
import { FilterChips } from '../components/FilterChips';
import { BrainEmpty } from '../components/BrainEmpty';
import { BrainPager } from '../components/BrainPager';
import { FindingsTable } from '../components/FindingsTable';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{
    status?: string | string[];
    type?: string | string[];
    page?: string | string[];
    /** A finding the assistant linked to, put on screen for it. */
    finding?: string | string[];
    lang?: string | string[];
  }>;
};

export default async function BrainFindingsPage({ searchParams }: Props) {
  const access = await getBrainAccessQuery();
  if (!access) {
    notFound();
  }
  const params = await searchParams;
  const rawType = Array.isArray(params.type) ? params.type[0] : params.type;
  const type = (FINDING_TYPE_FILTERS as readonly string[]).includes(
    rawType ?? '',
  )
    ? (rawType as KnowledgeFindingType)
    : undefined;
  const typed = (href: string) => withFindingType(href, type);
  const raw = params.status;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const listPage = parseListPage(params.page);
  const language = parseBrainLanguage(params.lang);
  const status: KnowledgeFindingStatus = (
    FINDING_STATUS_FILTERS as readonly string[]
  ).includes(value ?? '')
    ? (value as KnowledgeFindingStatus)
    : 'OPEN';

  const rawFinding = Array.isArray(params.finding)
    ? params.finding[0]
    : params.finding;
  const focused = dbUuid.safeParse(rawFinding).success ? rawFinding! : null;

  const scope = await getBrainLanguageScopeQuery(access.orgId, language);
  const [t, { items, total }, counts] = await Promise.all([
    getTranslations('brain'),
    getKnowledgeFindingsQuery(access.orgId, status, listPage, type, scope),
    getBrainStatusCountsQuery(access.orgId, scope),
  ]);

  return (
    <section>
      <title>{`${t('tabs.findings')} — ${t('title')}`}</title>
      <BrainScreen
        context={
          focused
            ? { view: 'finding', findingId: focused }
            : { view: 'inbox', status, ...(type ? { type } : {}) }
        }
      />
      {type && (
        <div className="mb-3 text-sm">
          <span className="mr-3 text-muted-foreground">
            {t(`findings.type.${type}`)}
          </span>
          <Link
            className="text-primary underline underline-offset-4"
            href={withLanguage('/brain/findings', language)}
          >
            {t('overview.clear-filter')}
          </Link>
        </div>
      )}
      <FilterChips
        label={t('filters.status')}
        options={FINDING_STATUS_FILTERS.map((s) => ({
          key: s,
          label: t(`findings.status.${s}`),
          href: typed(
            withLanguage(
              s === 'OPEN' ? '/brain/findings' : `/brain/findings?status=${s}`,
              language,
            ),
          ),
          active: status === s,
          count: counts.findings[s],
        }))}
      />
      {items.length === 0 && listPage === 1 ? (
        <BrainEmpty
          title={t(
            language
              ? 'findings.empty-in-language-title'
              : 'findings.empty-title',
          )}
          description={t(
            language
              ? 'findings.empty-in-language-description'
              : 'findings.empty-description',
          )}
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {t('findings.count', {
              shown: listRange(listPage, items.length),
              total,
            })}
          </p>
          <FindingsTable
            items={items}
            canWrite={access.canWrite}
            focusedId={focused}
            assistant={access.assistant}
            discussHref={(publicId) =>
              typed(
                withLanguage(
                  `/brain/findings?${new URLSearchParams({
                    ...(status === 'OPEN' ? {} : { status }),
                    ...(listPage > 1 ? { page: String(listPage) } : {}),
                    finding: publicId,
                  })}#finding-${publicId}`,
                  language,
                ),
              )
            }
          />
          <BrainPager
            page={listPage}
            total={total}
            hrefFor={(n) =>
              typed(
                withLanguage(
                  `/brain/findings?${new URLSearchParams({
                    ...(status === 'OPEN' ? {} : { status }),
                    page: String(n),
                  })}`,
                  language,
                ),
              )
            }
          />
        </>
      )}
    </section>
  );
}
