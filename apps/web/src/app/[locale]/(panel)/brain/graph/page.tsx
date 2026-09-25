import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';
import {
  getBrainGraphQuery,
  parseGraphParams,
} from '@/features/brain/services/queries/get-brain-graph-query';
import { getCurrentUserId } from '@/app/lib/utils/auth-helpers';
import { Link } from '@/i18n/routing';

import { BrainEmpty } from '../components/BrainEmpty';
import { BrainGraphCanvas } from '../components/BrainGraphCanvas';
import { FilterChips } from '../components/FilterChips';

export const dynamic = 'force-dynamic';

type Search = {
  focus?: string | string[];
  hops?: string | string[];
  budget?: string | string[];
  inferred?: string | string[];
  /** The page picked on the canvas, written back by it; see BrainGraphCanvas. */
  selected?: string | string[];
};

/**
 * The pages as a graph (spec D4). Never the whole graph: an overview of the
 * pages with open findings plus the most connected, or one page's
 * neighbourhood, within a node budget the URL chooses and the server clamps.
 * Every control is a link, so a view can be shared and reloaded.
 */
export default async function BrainGraphPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const access = await getBrainAccessQuery();
  if (!access) {
    notFound();
  }
  const search = await searchParams;
  const params = parseGraphParams(search);
  const selected = Array.isArray(search.selected)
    ? search.selected[0]
    : search.selected;
  const [t, view, userId] = await Promise.all([
    getTranslations('brain.graph'),
    getBrainGraphQuery(access.orgId, params),
    getCurrentUserId(),
  ]);

  const href = (over: Partial<Record<keyof Search, string | null>>) => {
    const q = new URLSearchParams();
    const merged = {
      focus: view.focus,
      hops: view.focus ? String(view.hops) : null,
      budget: String(view.budget),
      inferred: view.includeInferred ? '1' : null,
      ...over,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) {
        q.set(k, v);
      }
    }
    return `/brain/graph?${q.toString()}`;
  };
  const focusTitle = view.nodes.find((n) => n.id === view.focus)?.title;

  return (
    <section>
      <title>{t('title')}</title>
      {view.total.nodes === 0 ? (
        <BrainEmpty
          title={t('empty-title')}
          description={t('empty-description')}
        />
      ) : (
        <>
          {view.focus ? (
            <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium">
                {t('focus', { title: focusTitle ?? '' })}
              </span>
              <Link
                href={href({ focus: null, hops: null })}
                className="text-primary underline-offset-4 hover:underline"
              >
                {t('back-to-overview')}
              </Link>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-6">
            {view.focus ? (
              <FilterChips
                label={t('hops')}
                options={[1, 2].map((h) => ({
                  key: String(h),
                  label: h === 1 ? t('hops-1') : t('hops-2'),
                  href: href({ hops: String(h) }),
                  active: view.hops === h,
                }))}
              />
            ) : null}
            <FilterChips
              label={t('budget')}
              options={view.budgets.map((b) => ({
                key: String(b),
                label: String(b),
                href: href({ budget: String(b) }),
                active: view.budget === b,
              }))}
            />
            <FilterChips
              label={t('inferred')}
              options={[
                {
                  key: 'hide',
                  label: t('inferred-hidden'),
                  href: href({ inferred: null }),
                  active: !view.includeInferred,
                },
                {
                  key: 'show',
                  label: t('inferred-shown', {
                    count: view.inferred,
                  }),
                  href: href({ inferred: '1' }),
                  active: view.includeInferred,
                },
              ]}
            />
          </div>
          <p
            className="mb-2 text-xs text-muted-foreground"
            data-testid="brain-graph-count"
          >
            {t('shown', {
              nodes: view.shown.nodes,
              totalNodes: view.total.nodes,
              edges: view.shown.edges,
              totalEdges: view.total.edges,
            })}
          </p>
          <BrainGraphCanvas
            view={view}
            selected={selected}
            layoutScope={`${access.orgId}:${userId ?? 'anonymous'}`}
          />
        </>
      )}
    </section>
  );
}
