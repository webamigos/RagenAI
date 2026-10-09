'use client';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/routing';
import type { GraphTopics } from '@/features/brain/utils/graph-topics';
import { withLanguage } from '@/features/brain/utils/with-language';
export function BrainTopicMap({
  summary,
  language,
  selected,
}: {
  summary: GraphTopics;
  language: string | null;
  selected: string | null;
}) {
  const t = useTranslations('brain.graph');
  const largest = Math.max(
    1,
    ...summary.topics.map((group) => group.pages.length),
  );
  return (
    <Card className="min-w-0" data-testid="brain-topic-map">
      <CardHeader className="flex flex-wrap items-start justify-between gap-2 sm:flex-row">
        <CardTitle className="text-base">{t('topics-title')}</CardTitle>
        {/*
          The colours explained where the tiles start, not under them: below
          a long map the legend was off screen when the colours were not.
        */}
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>{t('topics-scale')}</p>
          <ul
            className="flex flex-wrap gap-x-4 gap-y-1"
            data-testid="brain-topic-legend"
          >
            <li className="flex items-center gap-2">
              <span
                className="size-3.5 rounded border border-ready bg-ready-tint"
                aria-hidden="true"
              />
              {t('topic-approved')}
            </li>
            <li className="flex items-center gap-2">
              <span
                className="size-3.5 rounded border border-pending bg-pending-tint"
                aria-hidden="true"
              />
              {t('topic-candidates')}
            </li>
          </ul>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid auto-rows-[minmax(84px,auto)] grid-cols-1 gap-3 sm:grid-cols-6">
          {summary.topics.map((group) => (
            <Link
              key={group.anchor}
              href={withLanguage(
                `/brain/graph?view=topics&topic=${group.anchor}`,
                language,
              )}
              aria-current={selected === group.anchor ? 'true' : undefined}
              data-testid="brain-topic"
              className={`flex min-w-0 flex-col justify-between gap-1 rounded-md border px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring hover:border-primary ${group.approved ? 'border-ready bg-ready-tint' : 'border-pending bg-pending-tint'} ${group.pages.length >= largest / 2 ? 'sm:col-span-3' : 'sm:col-span-2'} ${selected === group.anchor ? 'ring-2 ring-ring ring-offset-2' : ''}`}
            >
              <span className="line-clamp-2 break-words font-semibold">
                {group.label}
              </span>
              {/* Both counts in words: the tile's colour is never the only carrier. */}
              <span className="block tabular-nums text-xs text-muted-foreground">
                {t('topic-pages', { count: group.pages.length })} ·{' '}
                {t('topic-approved-count', { count: group.approved })}
              </span>
            </Link>
          ))}
        </div>
        {summary.isolated.length > 0 && (
          <div className="space-y-2 rounded-md border border-dashed p-4">
            <p className="font-medium">
              {t('isolated-count', { count: summary.isolated.length })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('isolated-description')}
            </p>
            <Link
              className="inline-flex min-h-8 items-center text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              href={withLanguage(
                '/brain/graph?view=topics&topic=isolated',
                language,
              )}
            >
              {t('review-isolated')}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
