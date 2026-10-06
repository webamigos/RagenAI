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
        <p className="text-sm text-muted-foreground">{t('topics-scale')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid auto-rows-[110px] grid-cols-1 gap-3 sm:grid-cols-6">
          {summary.topics.map((group) => (
            <Link
              key={group.anchor}
              href={withLanguage(
                `/brain/graph?view=topics&topic=${group.anchor}`,
                language,
              )}
              aria-current={selected === group.anchor ? 'true' : undefined}
              data-testid="brain-topic"
              className={`flex min-w-0 flex-col justify-between rounded-md border p-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring hover:border-primary ${group.approved ? 'border-ready bg-ready-tint' : 'border-pending bg-pending-tint'} ${group.pages.length >= largest / 2 ? 'sm:col-span-3 sm:row-span-2' : 'sm:col-span-2'} ${selected === group.anchor ? 'ring-2 ring-ring ring-offset-2' : ''}`}
            >
              <span className="break-words font-semibold">{group.label}</span>
              <span className="mt-3 space-y-1">
                <span className="block tabular-nums">
                  {t('topic-pages', { count: group.pages.length })}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {group.approved
                    ? t('topic-approved-count', { count: group.approved })
                    : t('topic-candidates')}
                </span>
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
        <ul className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <span
              className="size-4 rounded border border-ready bg-ready-tint"
              aria-hidden="true"
            />
            {t('topic-approved')}
          </li>
          <li className="flex items-center gap-2">
            <span
              className="size-4 rounded border border-pending bg-pending-tint"
              aria-hidden="true"
            />
            {t('topic-candidates')}
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
