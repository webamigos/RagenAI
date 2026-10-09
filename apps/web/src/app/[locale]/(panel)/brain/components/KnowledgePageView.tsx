import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { formatIsoDuration } from '@/features/brain/utils/format-iso-duration';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

import '@/app/components/Assistant/ChatOutput/chat-response.css';
import { Badge } from '@/components/ui/badge';
import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';
import { getBrainReviewOptionsQuery } from '@/features/brain/services/queries/get-brain-review-options-query';
import { getKnowledgePageQuery } from '@/features/brain/services/queries/get-knowledge-page-query';
import { getMergeTargetsQuery } from '@/features/brain/services/queries/get-merge-targets-query';
import {
  pageBodyForDisplay,
  statusDecision,
} from '@/features/brain/utils/page-body';
import { relationKindLabel } from '@/features/brain/utils/relation-kind';
import { pageStatusVariant } from '@/features/brain/utils/page-status-variant';
import { Link } from '@/i18n/routing';

import { BrainBreadcrumbs } from './BrainBreadcrumbs';
import { BrainScreen } from './assistant/BrainAssistantContext';
import { AccessEditor } from './AccessEditor';
import { AccessList } from './AccessList';
import { BrainEmpty } from './BrainEmpty';
import { DecisionHistory } from './DecisionHistory';
import { FindingsTable } from './FindingsTable';
import { MergePicker } from './MergePicker';
import { OwnerPicker } from './OwnerPicker';
import { PublicationControls } from './PublicationControls';
import { ReviewActions } from './ReviewActions';

/**
 * One knowledge page as a curator reviews it (spec D1): the statements and
 * their evidence, who it is open to, the state of every source it cites, its
 * relations, and what is wrong with it — and, since D2, the decisions: set
 * the owner and the access, approve or reject, each one a ledger row listed
 * under History.
 */
export async function KnowledgePageView({
  pageId,
  variant,
}: {
  pageId: string;
  /** `drawer`: opened over the graph, which keeps its own title and way back. */
  variant: 'page' | 'drawer';
}) {
  const access = await getBrainAccessQuery();
  if (!access) {
    notFound();
  }
  const page = await getKnowledgePageQuery(access.orgId, pageId);
  if (!page) {
    notFound();
  }
  const [t, format, locale, options, mergeTargets] = await Promise.all([
    getTranslations('brain'),
    getFormatter(),
    getLocale(),
    getBrainReviewOptionsQuery(access.orgId),
    access.canWrite && page.status === 'CANDIDATE'
      ? getMergeTargetsQuery(access.orgId, page)
      : Promise.resolve([]),
  ]);
  const curated = page.status !== 'REJECTED';
  const decided = statusDecision(page.status, page.decisions);
  const date = (iso: string) =>
    format.dateTime(new Date(iso), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <article className="@container">
      <BrainScreen context={{ view: 'page', pageId: page.publicId }} />
      {variant === 'page' && (
        <>
          <title>{`${page.title} – ${t('title')}`}</title>
          <BrainBreadcrumbs current={page.title} />
        </>
      )}

      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h2
          className={
            variant === 'page'
              ? 'font-display text-xl font-semibold text-foreground'
              : 'text-base font-semibold text-foreground'
          }
        >
          {page.title}
        </h2>
        <Badge variant={pageStatusVariant(page.status)}>
          {t(`page-status.${page.status}`)}
        </Badge>
        <Badge variant="outline">{t(`page-type.${page.type}`)}</Badge>
        {page.published && (
          <Badge variant="outline">{t('pages.published')}</Badge>
        )}
        {access.canWrite && page.status === 'CANDIDATE' && (
          <div className="ml-auto">
            <ReviewActions
              publicId={page.publicId}
              updatedAt={page.updatedAt}
              hasOwner={page.ownerId !== null}
            />
          </div>
        )}
      </header>

      {page.supersededBy && (
        <p className="mb-4 rounded-[6px] border border-border bg-background p-3 text-sm">
          {t('page.superseded-by')}{' '}
          <Link
            href={`/brain/pages/${page.supersededBy.publicId}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {page.supersededBy.title}
          </Link>
        </p>
      )}

      <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-[6px] border border-border bg-background p-4">
            <div className="chat-response text-sm">
              <ReactMarkdown>
                {pageBodyForDisplay(page.content, page.title, (n) => {
                  const source = page.sources[n - 1];
                  return source ? `source-${source.id}` : null;
                })}
              </ReactMarkdown>
            </div>
          </section>

          <section aria-labelledby="brain-sources">
            <h3 id="brain-sources" className="mb-2 text-sm font-semibold">
              {t('page.sources.title', { count: page.sources.length })}
            </h3>
            <ol className="space-y-2">
              {page.sources.map((source, i) => (
                <li
                  key={source.id}
                  id={`source-${source.id}`}
                  data-testid="brain-source"
                  className="scroll-mt-4 rounded-[6px] border border-border bg-background p-3 text-sm target:border-primary"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">[{i + 1}]</span>
                    {source.documentId ? (
                      <Link
                        href={`/knowledge/documents/${source.documentId}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {source.fileName}
                      </Link>
                    ) : (
                      <span>
                        {source.fileName ?? t('page.sources.unknown-file')}
                      </span>
                    )}
                    {source.span !== '—' && <span>· {source.span}</span>}
                    {source.pinnedVersion !== null && (
                      <span>
                        ·{' '}
                        {t('page.sources.version', { n: source.pinnedVersion })}
                      </span>
                    )}
                    {source.state !== 'current' && (
                      <Badge variant="outline">
                        {t(`page.sources.state.${source.state}`)}
                      </Badge>
                    )}
                  </div>
                  <blockquote className="border-l-2 border-border pl-3 text-foreground">
                    {source.quote}
                  </blockquote>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="brain-findings">
            <h3 id="brain-findings" className="mb-2 text-sm font-semibold">
              {t('page.findings.title')}
            </h3>
            {page.findings.length === 0 ? (
              <BrainEmpty
                title={t('page.findings.empty-title')}
                description={t('page.findings.empty-description')}
              />
            ) : (
              <FindingsTable items={page.findings} showSubject={false} />
            )}
          </section>
        </div>

        <aside className="space-y-5 text-sm">
          <section aria-labelledby="brain-state">
            <h3
              id="brain-state"
              className="mb-1 text-xs font-medium uppercase text-muted-foreground"
            >
              {t('page.state')}
            </h3>
            {/*
              One line for where the page stands and who put it there,
              taken from the ledger below, instead of a status here and a
              "never verified" there.
            */}
            <p className="text-foreground" data-testid="brain-page-state">
              {decided
                ? t('page.status-by', {
                    status: t(`page-status.${page.status}`),
                    name: decided.actorName ?? t('history.unknown-actor'),
                    date: date(decided.createdAt),
                  })
                : t(`page-status.${page.status}`)}
            </p>
            {page.lastVerifiedAt && (
              <p className="text-muted-foreground">
                {t('page.last-verified', { date: date(page.lastVerifiedAt) })}
              </p>
            )}
            {page.verifyEvery && (
              <p className="text-muted-foreground">
                {t('page.verify-every', {
                  every: formatIsoDuration(page.verifyEvery, locale),
                })}
              </p>
            )}
            {(page.status === 'APPROVED' || page.publication !== 'none') && (
              <div className="mt-3">
                {/*
                  A reader gets the state in words, the same sentence the
                  controls lead with, and none of the buttons.
                */}
                {!access.canWrite ? (
                  <p className="text-foreground">
                    {t(`publication.state.${page.publication}`)}
                  </p>
                ) : (
                  <PublicationControls
                    publicId={page.publicId}
                    updatedAt={page.updatedAt}
                    state={page.publication}
                    outdated={page.publicationOutdated}
                    blockers={[
                      ...(page.status !== 'APPROVED'
                        ? [t('page.publish-blocker.status')]
                        : []),
                      ...(page.ownerId === null
                        ? [t('page.publish-blocker.owner')]
                        : []),
                      ...(page.principals.length === 0
                        ? [t('page.publish-blocker.access')]
                        : []),
                    ]}
                  />
                )}
              </div>
            )}
          </section>
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              {t('page.owner')}
            </h3>
            <p>{page.ownerName ?? t('pages.no-owner')}</p>
            {access.canWrite && curated && (
              <div className="mt-2">
                <OwnerPicker
                  publicId={page.publicId}
                  updatedAt={page.updatedAt}
                  ownerId={page.ownerId}
                  members={options.members}
                />
              </div>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              {t('page.access.title')}
            </h3>
            <AccessList entries={page.access} />
            {access.canWrite && curated && (
              <AccessEditor
                publicId={page.publicId}
                updatedAt={page.updatedAt}
                orgId={access.orgId}
                principals={page.principals}
                options={options}
              />
            )}
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              {t('page.relations.title')}
            </h3>
            <Link
              href={`/brain/graph?focus=${page.publicId}`}
              className="mb-1 inline-block text-xs text-primary underline-offset-4 hover:underline"
            >
              {t('page.relations.show-in-graph')}
            </Link>
            {page.edges.length === 0 ? (
              <p className="text-muted-foreground">
                {t('page.relations.empty')}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {page.edges.map((edge, i) => (
                  <li key={i}>
                    <span className="text-muted-foreground">
                      {edge.direction === 'out'
                        ? t('page.relations.out', {
                            kind: relationKindLabel(edge.kind, t),
                          })
                        : t('page.relations.in', {
                            kind: relationKindLabel(edge.kind, t),
                          })}{' '}
                    </span>
                    <Link
                      href={`/brain/pages/${edge.page.publicId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {edge.page.title}
                    </Link>
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({t(`origin.${edge.origin}`)})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {access.canWrite && page.status === 'CANDIDATE' && (
            <div>
              <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                {t('page.merge')}
              </h3>
              <MergePicker
                publicId={page.publicId}
                updatedAt={page.updatedAt}
                targets={mergeTargets}
              />
            </div>
          )}
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              {t('page.history')}
            </h3>
            <DecisionHistory decisions={page.decisions} />
          </div>
        </aside>
      </div>
    </article>
  );
}
