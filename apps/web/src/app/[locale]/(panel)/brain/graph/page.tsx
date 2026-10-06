import { getTranslations } from 'next-intl/server';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { notFound } from 'next/navigation';
import { parseBrainLanguage } from '@/features/brain/contracts/brain-language.types';
import { getBrainLanguageScopeQuery } from '@/features/brain/services/queries/brain-language-scope';

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
import { BrainTopicMap } from '../components/BrainTopicMap';
import { GraphPageSearch } from '../components/GraphPageSearch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { pageStatusVariant } from '@/features/brain/utils/page-status-variant';
import { getBrainTopicsQuery } from '@/features/brain/services/queries/get-brain-topics-query';
import { parseGraphMode } from '@/features/brain/utils/graph-topics';
import { withLanguage } from '@/features/brain/utils/with-language';

export const dynamic = 'force-dynamic';

type Search = {
  view?: string | string[];
  topic?: string | string[];
  focus?: string | string[];
  hops?: string | string[];
  budget?: string | string[];
  inferred?: string | string[];
  /** The page picked on the canvas, written back by it; see BrainGraphCanvas. */
  selected?: string | string[];
  lang?: string | string[];
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
  const language = parseBrainLanguage(search.lang);
  const scope = await getBrainLanguageScopeQuery(access.orgId, language);
  const mode = parseGraphMode(search.view, params.focus);
  const topics =
    mode === 'full' ? null : await getBrainTopicsQuery(access.orgId, scope);
  if (
    topics &&
    params.focus &&
    !topics.pages.some((page) => page.id === params.focus)
  ) {
    notFound();
  }
  const topicParam = Array.isArray(search.topic)
    ? search.topic[0]
    : search.topic;
  const chosenTopic =
    topics?.topics.find((topic) =>
      topic.pages.some((page) => page.id === topicParam),
    ) ?? topics?.topics[0];
  const members =
    topicParam === 'isolated'
      ? (topics?.isolated ?? [])
      : (chosenTopic?.pages ?? []);
  const effectiveParams =
    mode === 'full'
      ? params
      : {
          ...params,
          hops: 1 as const,
          focus:
            params.focus ??
            (topicParam === 'isolated'
              ? members[0]?.id
              : chosenTopic?.anchor) ??
            topics?.pages[0]?.id ??
            null,
        };
  const [t, view, userId] = await Promise.all([
    getTranslations('brain.graph'),
    getBrainGraphQuery(access.orgId, effectiveParams, scope),
    getCurrentUserId(),
  ]);

  const href = (over: Partial<Record<keyof Search, string | null>>) => {
    const q = new URLSearchParams();
    const merged = {
      view: mode,
      focus: view.focus,
      hops: view.focus ? String(view.hops) : null,
      budget: String(view.budget),
      inferred: view.includeInferred ? '1' : null,
      lang: language,
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
      <title>{t('connections-title')}</title>
      <div className="mb-5 space-y-3">
        <Link
          href={withLanguage('/brain/overview', language)}
          className="inline-flex min-h-8 items-center text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t('back-brain')}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold">{t('connections-title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('connections-description')}
            </p>
          </div>
          <nav
            aria-label={t('views-label')}
            className="flex max-w-full flex-wrap gap-1 rounded-md bg-muted p-1"
          >
            {(['topics', 'neighbourhood', 'full'] as const).map((key) => (
              <Link
                key={key}
                href={href({
                  view: key,
                  focus: key === 'neighbourhood' ? view.focus : null,
                  hops: null,
                })}
                aria-current={mode === key ? 'page' : undefined}
                className={`inline-flex min-h-8 items-center rounded px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${mode === key ? 'bg-card font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t(`views.${key}`)}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      {params.focus && view.focus ? (
        // The neighbourhood as an active filter, removed like one: a chip
        // with the page's name and an × whose name is "back to the
        // overview". The plain link beside a heading read as text, not as
        // a way out.
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span
            data-testid="brain-graph-focus"
            className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-foreground bg-accent pl-2.5 pr-1 text-xs font-medium text-foreground"
          >
            {t('focus', { title: focusTitle ?? '' })}
            <Link
              href={href({
                view: mode === 'full' ? 'full' : 'topics',
                focus: null,
                hops: null,
              })}
              aria-label={t('back-to-overview')}
              title={t('back-to-overview')}
              data-testid="brain-graph-focus-clear"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <XMarkIcon className="size-3.5" aria-hidden="true" />
            </Link>
          </span>
        </div>
      ) : null}
      {view.total.nodes === 0 && (
        <BrainEmpty
          title={t(language ? 'empty-in-language-title' : 'empty-title')}
          description={t(
            language ? 'empty-in-language-description' : 'empty-description',
          )}
        />
      )}
      {view.total.nodes > 0 && mode === 'full' && (
        <>
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
            language={language}
          />
        </>
      )}
      {view.total.nodes > 0 && mode !== 'full' && topics && (
        <>
          <GraphPageSearch pages={topics.pages} language={language} />
          <div
            className={
              mode === 'topics'
                ? 'grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'
                : 'grid min-w-0 gap-4'
            }
          >
            {mode === 'topics' && (
              <BrainTopicMap
                summary={topics}
                language={language}
                selected={
                  topicParam === 'isolated'
                    ? null
                    : (chosenTopic?.anchor ?? null)
                }
              />
            )}
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="text-base">
                  {topicParam === 'isolated' && mode === 'topics'
                    ? t('isolated-count', { count: members.length })
                    : t('views.neighbourhood')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!(topicParam === 'isolated' && mode === 'topics') && (
                  <BrainGraphCanvas
                    view={view}
                    selected={selected ?? view.focus ?? undefined}
                    layoutScope={`${access.orgId}:${userId ?? 'anonymous'}`}
                    language={language}
                    compact
                  />
                )}
                {mode === 'topics' &&
                  topicParam !== 'isolated' &&
                  chosenTopic && (
                    <Button asChild>
                      <Link
                        href={withLanguage(
                          `/brain/graph?view=topics&topic=${chosenTopic.anchor}`,
                          language,
                        )}
                      >
                        {t('review-group', { count: members.length })}
                      </Link>
                    </Button>
                  )}
                {mode === 'topics' && topicParam && (
                  <div data-testid="brain-topic-members">
                    <h3 className="mb-2 text-sm font-semibold">
                      {topicParam === 'isolated'
                        ? t('isolated-list')
                        : t('group-pages', { count: members.length })}
                    </h3>
                    <ul className="max-h-96 space-y-1 overflow-y-auto">
                      {members.map((page) => (
                        <li
                          key={page.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"
                        >
                          <Link
                            className="inline-flex min-h-8 min-w-0 items-center break-words text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            href={withLanguage(
                              `/brain/pages/${page.id}`,
                              language,
                            )}
                          >
                            {page.title}
                          </Link>
                          <Badge variant={pageStatusVariant(page.status)}>
                            {t(`status.${page.status}`)}
                          </Badge>
                          {page.status === 'CANDIDATE' && (
                            <Link
                              className="inline-flex min-h-8 items-center text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                              href={withLanguage(
                                `/brain/review?page=${page.id}`,
                                language,
                              )}
                            >
                              {t('review-page')}
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
