import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { BrainOverview } from '@/features/brain/contracts/brain-overview.types';
import type { BrainLanguage } from '@/features/brain/contracts/brain-language.types';
import type { KnowledgeFindingType } from '@/features/brain/contracts/brain.types';
import { withLanguage } from '@/features/brain/utils/with-language';
import { Link } from '@/i18n/routing';
import { BrainUploadButton } from './BrainUploadButton';
import { BrainEmpty } from './BrainEmpty';

export function BrainOverviewPanel({
  data,
  language,
  canWrite,
}: {
  data: BrainOverview;
  language: BrainLanguage | null;
  canWrite: boolean;
}) {
  const t = useTranslations('brain');
  const href = (path: string) => withLanguage(path, language);
  if (data.documents === 0) {
    return (
      <div data-testid="brain-overview">
        <BrainEmpty
          title={t('overview.empty-title')}
          description={t(
            language
              ? 'overview.empty-language-description'
              : 'overview.empty-description',
          )}
        />
        {canWrite && <BrainUploadButton />}
      </div>
    );
  }
  const pages = Math.max(1, data.candidates + data.approved);
  const stages = [
    {
      key: 'documents',
      count: data.documents,
      path: '/brain/documents',
      denominator: data.documents,
    },
    {
      key: 'candidates',
      count: data.candidates,
      path: '/brain?status=CANDIDATE',
      denominator: pages,
    },
    {
      key: 'approved',
      count: data.approved,
      path: '/brain?status=APPROVED',
      denominator: pages,
    },
    {
      key: 'published',
      count: data.published,
      path: '/brain?published=true',
      denominator: pages,
    },
  ] as const;
  const attention = [
    {
      key: 'unowned',
      count: data.unownedCandidates,
      title: t('overview.unowned-title'),
      description: t('overview.unowned-description'),
      path: '/brain?status=CANDIDATE&owner=none',
    },
    {
      key: 'empty',
      count: data.emptyDocuments,
      title: t('overview.empty-documents-title'),
      description: t('overview.empty-documents-description'),
      path: '/brain/documents?coverage=empty',
    },
    ...(
      Object.entries(data.openFindings) as [KnowledgeFindingType, number][]
    ).map(([type, count]) => ({
      key: type,
      count,
      title: t(`findings.type.${type}`),
      description: t('overview.finding-description'),
      path: `/brain/findings?status=OPEN&type=${type}`,
    })),
  ].filter((item) => item.count > 0);
  const maxCoverage = Math.max(
    1,
    ...data.topDocuments.map(
      (file) => file.approvedPages + file.candidatePages,
    ),
  );
  return (
    <div className="space-y-6" data-testid="brain-overview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t('overview.intro')}
        </p>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <BrainUploadButton />
            {data.candidates > 0 ? (
              <Button asChild>
                <Link href={href('/brain/review')}>
                  {t('overview.start-review', { count: data.candidates })}
                </Link>
              </Button>
            ) : (
              <Button disabled>
                {t('overview.start-review', { count: 0 })}
              </Button>
            )}
          </div>
        )}
      </div>
      <Card data-testid="overview-pipeline">
        <CardHeader className="flex flex-wrap items-start justify-between gap-2 sm:flex-row">
          <CardTitle role="heading" aria-level={2} className="text-base">
            {t('overview.pipeline-title')}
          </CardTitle>
          <p className="max-w-md text-sm text-muted-foreground">
            {t('overview.publication-description')}
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stages.map((stage, index) => (
            <article
              key={stage.key}
              data-testid={`overview-${stage.key}`}
              className={
                stage.key === 'published'
                  ? 'space-y-3 rounded-md border border-ready bg-ready-tint p-4'
                  : 'space-y-3 rounded-md border border-border p-4'
              }
            >
              <Link
                href={href(stage.path)}
                className="block rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="text-sm">
                  {index + 1}. {t(`overview.stages.${stage.key}`)}
                </span>
                <strong className="mt-2 block font-display text-4xl tabular-nums text-foreground">
                  {stage.count}
                </strong>
              </Link>
              <Progress
                value={Math.min(100, (stage.count / stage.denominator) * 100)}
                aria-label={t(`overview.stages.${stage.key}`)}
                className={
                  stage.key === 'approved' || stage.key === 'published'
                    ? 'bg-muted [&_[data-slot=progress-indicator]]:bg-ready'
                    : 'bg-muted'
                }
              />
              {stage.key === 'documents' && (
                <Link
                  className="text-sm text-primary underline underline-offset-4"
                  href={href('/brain/documents?coverage=empty')}
                >
                  {t('overview.empty-documents-count', {
                    count: data.emptyDocuments,
                  })}
                </Link>
              )}
              {stage.key === 'candidates' && (
                <span className="block text-sm text-muted-foreground">
                  {t('overview.unowned-count', {
                    count: data.unownedCandidates,
                  })}
                </span>
              )}
              {stage.key === 'approved' && (
                <span className="block text-sm text-muted-foreground">
                  {t('overview.approved-share', {
                    percent: Math.round((data.approved / pages) * 100),
                  })}
                </span>
              )}
              {stage.key === 'published' && (
                <Link
                  className="text-sm text-primary underline underline-offset-4"
                  href={href('/brain?status=APPROVED&published=false')}
                >
                  {t('overview.awaiting-publication', {
                    count: data.approvedUnpublished,
                  })}
                </Link>
              )}
            </article>
          ))}
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="text-base">
              {t('overview.attention-title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('overview.attention-empty')}
              </p>
            ) : (
              attention.map((item) => (
                <Link
                  key={item.key}
                  href={href(item.path)}
                  className="flex min-h-8 items-start gap-3 rounded-md bg-muted p-3 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Badge variant="outline" className="shrink-0 tabular-nums">
                    {item.count}
                  </Badge>
                  <span>
                    <strong className="block text-sm font-semibold text-foreground">
                      {item.title}
                    </strong>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="text-base">
              {t('overview.ranking-title')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('overview.legend')}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('overview.ranking-empty')}
              </p>
            ) : (
              <ul className="space-y-3">
                {data.topDocuments.map((file) => (
                  <li key={file.fileId}>
                    <Link
                      href={href(`/brain?status=CANDIDATE&file=${file.fileId}`)}
                      className="grid grid-cols-1 items-center gap-2 rounded-sm py-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:grid-cols-2"
                    >
                      <span
                        className="truncate text-sm text-foreground"
                        title={file.fileName}
                      >
                        {file.fileName}
                      </span>
                      <span className="min-w-0">
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 100 3"
                          preserveAspectRatio="none"
                          className="h-3 w-full overflow-hidden rounded-sm"
                        >
                          <rect width="100" height="3" className="fill-muted" />
                          <rect
                            width={(file.approvedPages / maxCoverage) * 100}
                            height="3"
                            className="fill-ready"
                          />
                          <rect
                            x={(file.approvedPages / maxCoverage) * 100}
                            width={(file.candidatePages / maxCoverage) * 100}
                            height="3"
                            className="fill-primary/25"
                          />
                        </svg>
                        <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                          {t('overview.coverage-counts', {
                            approved: file.approvedPages,
                            candidates: file.candidatePages,
                          })}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link
              className="inline-block min-h-8 text-sm text-primary underline underline-offset-4"
              href={href('/brain/documents')}
            >
              {t('overview.all-documents', { count: data.documents })}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
