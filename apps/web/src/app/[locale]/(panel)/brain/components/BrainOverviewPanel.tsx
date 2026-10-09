import { TouchTarget } from '@ragenai/common-ui/TouchTarget';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { BrainOverview } from '@/features/brain/contracts/brain-overview.types';
import type { BrainLanguage } from '@/features/brain/contracts/brain-language.types';
import type { KnowledgeFindingType } from '@/features/brain/contracts/brain.types';
import { nextStep } from '@/features/brain/utils/next-step';
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
        {canWrite && <BrainUploadButton variant="outline" />}
      </div>
    );
  }
  const pages = Math.max(1, data.candidates + data.approved);
  const step = nextStep(data);
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
      {canWrite && step && (
        <section
          aria-labelledby="overview-next-step-title"
          data-testid="overview-next-step"
          className="flex flex-wrap items-center justify-between gap-4 rounded-[6px] border border-border bg-card p-4"
        >
          <div className="min-w-0 max-w-2xl space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('overview.next.label')}
            </p>
            <h2
              id="overview-next-step-title"
              className="font-display text-lg font-semibold text-foreground"
            >
              {t(`overview.next.${step.kind}.title`, { count: step.count })}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(`overview.next.${step.kind}.description`)}
            </p>
          </div>
          <Button asChild className="relative">
            <Link href={href(step.path)}>
              <TouchTarget>
                {t(`overview.next.${step.kind}.action`)}
              </TouchTarget>
            </Link>
          </Button>
        </section>
      )}
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
            <Link
              key={stage.key}
              href={href(stage.path)}
              data-testid={`overview-${stage.key}`}
              className={`block space-y-3 rounded-md border p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                stage.key === 'published'
                  ? 'border-ready bg-ready-tint'
                  : 'border-border'
              }`}
            >
              <span className="block text-sm text-primary">
                {index + 1}. {t(`overview.stages.${stage.key}`)}
              </span>
              <strong className="block font-display text-4xl tabular-nums text-foreground">
                {stage.count}
              </strong>
              <Progress
                value={Math.min(100, (stage.count / stage.denominator) * 100)}
                aria-hidden="true"
                className={
                  stage.key === 'approved' || stage.key === 'published'
                    ? 'bg-muted [&_[data-slot=progress-indicator]]:bg-ready'
                    : 'bg-muted'
                }
              />
              <span className="block text-sm text-muted-foreground">
                {stage.key === 'documents' &&
                  t('overview.empty-documents-count', {
                    count: data.emptyDocuments,
                  })}
                {stage.key === 'candidates' &&
                  t('overview.unowned-count', {
                    count: data.unownedCandidates,
                  })}
                {stage.key === 'approved' &&
                  t('overview.approved-share', {
                    approved: data.approved,
                    total: data.candidates + data.approved,
                  })}
                {stage.key === 'published' &&
                  t('overview.awaiting-publication', {
                    count: data.awaitingPublication,
                  })}
              </span>
            </Link>
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
            {/*
              What the bar's two colours mean. Each row also states both
              counts in words, so the colours are never the only carrier.
            */}
            <p
              className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground"
              data-testid="overview-ranking-legend"
            >
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full bg-ready"
                />
                {t('overview.legend-approved')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full bg-primary/25"
                />
                {t('overview.legend-to-review')}
              </span>
              <span>{t('overview.legend')}</span>
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
