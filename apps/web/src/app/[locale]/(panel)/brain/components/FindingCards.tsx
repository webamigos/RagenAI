import { getOrphanRelationsQuery } from '@/features/brain/services/queries/get-orphan-relations-query';
import { FindingRelationPicker } from './FindingRelationPicker';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import type { KnowledgeFindingListItem } from '@/features/brain/contracts/brain.types';
import type { ReviewOptions } from '@/features/brain/contracts/brain-review.types';
import { groupFindingBatches } from '@/features/brain/utils/group-finding-batches';
import { Link } from '@/i18n/routing';
import { FindingSummaryView } from './FindingSummaryView';
import { RetryExtractionButton } from './RetryExtractionButton';
import { OwnerPicker } from './OwnerPicker';
import { DismissOrphanButton } from './DismissOrphanButton';

export async function FindingCards({
  items,
  canWrite,
  members,
  focusedId,
  assistant,
  discussHref,
  language,
  orgId,
}: {
  items: KnowledgeFindingListItem[];
  canWrite: boolean;
  members: ReviewOptions['members'];
  focusedId: string | null;
  assistant: boolean;
  discussHref: (publicId: string) => string;
  language: string | null;
  orgId: string;
}) {
  const [t, format] = await Promise.all([
    getTranslations('brain.findings'),
    getFormatter(),
  ]);
  const date = (iso: string) =>
    format.dateTime(new Date(iso), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  const orphanIds = items
    .filter((item) => item.type === 'ORPHAN' && item.status === 'OPEN')
    .map((item) => item.publicId);
  const proposals =
    canWrite && orphanIds.length
      ? await getOrphanRelationsQuery(orgId, orphanIds)
      : new Map();
  async function card(item: KnowledgeFindingListItem) {
    const open = item.status === 'OPEN';
    const proposal = proposals.get(item.publicId);
    const page = item.pages[0];
    const reviewHref = page
      ? `/brain/review?${new URLSearchParams({ page: page.publicId, ...(language ? { lang: language } : {}) })}`
      : null;
    return (
      <article
        key={item.publicId}
        id={`finding-${item.publicId}`}
        data-testid="brain-finding-card"
        aria-current={item.publicId === focusedId ? 'true' : undefined}
        className={`min-w-0 rounded-md border border-border bg-card p-4 ${item.publicId === focusedId ? 'ring-2 ring-ring' : ''}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{t(`type.${item.type}`)}</Badge>
              <span className="text-xs text-muted-foreground">
                {t(`severity.${item.severity}`)}
              </span>
            </div>
            <h2 className="break-words text-base font-medium">
              {item.pages.length
                ? item.pages.map((p) => (
                    <Link
                      key={p.publicId}
                      href={`/brain/pages/${p.publicId}`}
                      className="mr-3 text-primary underline-offset-4 hover:underline"
                    >
                      {p.title}
                    </Link>
                  ))
                : (item.file?.name ?? t('subject-gone'))}
            </h2>
          </div>
          <time
            dateTime={item.detectedAt}
            className="text-xs tabular-nums text-muted-foreground"
          >
            {date(item.detectedAt)}
          </time>
        </div>
        <div className="mt-3">
          <FindingSummaryView summary={item.summary} />
        </div>
        {open && (
          <p className="mt-2 text-sm text-muted-foreground">
            {t(`why.${item.type}`)}
          </p>
        )}
        {proposal && <FindingRelationPicker proposal={proposal} />}
        {open && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {item.type === 'EXTRACTION_FAILED' && canWrite && item.file && (
              <RetryExtractionButton
                findingPublicId={item.publicId}
                label={t('retry-extraction')}
              />
            )}
            {item.type === 'UNOWNED' &&
              canWrite &&
              item.reviewPages?.map((p) => (
                <div key={p.publicId} className="w-full max-w-sm">
                  <p className="mb-1 text-sm">{p.title}</p>
                  <OwnerPicker
                    key={`${p.publicId}-${p.updatedAt}`}
                    publicId={p.publicId}
                    updatedAt={p.updatedAt}
                    ownerId={p.ownerId}
                    members={members}
                  />
                </div>
              ))}
            {(item.type === 'STALE' ||
              item.type === 'CONTRADICTION' ||
              item.type === 'GAP') &&
              reviewHref && (
                <Link
                  href={reviewHref}
                  className="inline-flex min-h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
                >
                  {t('open-review')}
                </Link>
              )}
            {item.type === 'ORPHAN' && page && (
              <Link
                href={`/brain/graph?${new URLSearchParams({ view: 'neighbourhood', focus: page.publicId, inferred: '1', ...(language ? { lang: language } : {}) })}`}
                className="inline-flex min-h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
              >
                {t('view-relations')}
              </Link>
            )}
            {item.type === 'ORPHAN' && canWrite && (
              <DismissOrphanButton publicId={item.publicId} />
            )}
            {assistant && (
              <Link
                href={discussHref(item.publicId)}
                data-testid="brain-finding-discuss"
                className="inline-flex min-h-8 items-center text-sm text-primary underline-offset-4 hover:underline"
              >
                {t('discuss')}
              </Link>
            )}
          </div>
        )}
      </article>
    );
  }
  return (
    <div className="min-w-0 space-y-3">
      {await Promise.all(
        groupFindingBatches(items).map(async (batch) => {
          if (batch.items[0].status === 'OPEN') {
            return card(batch.items[0]);
          }
          return (
            <details
              key={batch.items[0].publicId}
              data-testid="brain-finding-batch"
              open={
                batch.items.some((item) => item.publicId === focusedId) ||
                undefined
              }
              className="rounded-md border border-border bg-card p-4"
            >
              <summary className="min-h-8 cursor-pointer rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <span className="font-medium">
                  {t('batch', {
                    count: batch.items.length,
                    type: t(`type.${batch.items[0].type}`),
                  })}
                </span>
                <span className="ml-3 tabular-nums text-muted-foreground">
                  {date(batch.from)}
                  {batch.to !== batch.from && ` – ${date(batch.to)}`}
                </span>
              </summary>
              <p className="my-3 text-xs text-muted-foreground">
                {t('batch-scope')}
              </p>
              <div className="space-y-3">
                {await Promise.all(batch.items.map(card))}
              </div>
            </details>
          );
        }),
      )}
    </div>
  );
}
