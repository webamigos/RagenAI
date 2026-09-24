import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { getFormatter, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

import '@/app/components/Assistant/ChatOutput/chat-response.css';
import { Badge } from '@/components/ui/badge';
import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';
import { getKnowledgePageQuery } from '@/features/brain/services/queries/get-knowledge-page-query';
import { Link } from '@/i18n/routing';

import { AccessList } from '../../components/AccessList';
import { BrainEmpty } from '../../components/BrainEmpty';
import { FindingsTable } from '../../components/FindingsTable';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ pageId: string }> };

/**
 * One knowledge page as a curator reviews it (spec D1): the statements and
 * their evidence, who it is open to, the state of every source it cites, its
 * relations, and what is wrong with it. Read-only — the actions are D2's.
 */
export default async function BrainPageDetail({ params }: Props) {
  const access = await getBrainAccessQuery();
  if (!access) {
    notFound();
  }
  const { pageId } = await params;
  const page = await getKnowledgePageQuery(access.orgId, pageId);
  if (!page) {
    notFound();
  }
  const [t, format] = await Promise.all([
    getTranslations('brain'),
    getFormatter(),
  ]);
  const date = (iso: string) =>
    format.dateTime(new Date(iso), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <article>
      <title>{`${page.title} — ${t('title')}`}</title>
      <Link
        href="/brain"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
        {t('page.back')}
      </Link>

      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">
          {page.title}
        </h2>
        <Badge variant="secondary">{t(`page-status.${page.status}`)}</Badge>
        <Badge variant="outline">{t(`page-type.${page.type}`)}</Badge>
        {page.published && (
          <Badge variant="outline">{t('pages.published')}</Badge>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-[6px] border border-border bg-background p-4">
            <div className="chat-response text-sm">
              <ReactMarkdown>
                {withoutTitle(page.content, page.title)}
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
                  data-testid="brain-source"
                  className="rounded-[6px] border border-border bg-background p-3 text-sm"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">{i + 1}.</span>
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
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              {t('page.owner')}
            </h3>
            <p>{page.ownerName ?? t('pages.no-owner')}</p>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              {t('page.access.title')}
            </h3>
            <AccessList entries={page.access} />
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              {t('page.verification')}
            </h3>
            <p>
              {page.lastVerifiedAt
                ? t('page.last-verified', { date: date(page.lastVerifiedAt) })
                : t('page.never-verified')}
            </p>
            {page.verifyEvery && (
              <p className="text-muted-foreground">
                {t('page.verify-every', { every: page.verifyEvery })}
              </p>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              {t('page.relations.title')}
            </h3>
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
                        ? t('page.relations.out', { kind: edge.kind })
                        : t('page.relations.in', { kind: edge.kind })}{' '}
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
        </aside>
      </div>
    </article>
  );
}

/**
 * The page's markdown starts with its own title as `# …`, which the header
 * above already shows. Dropped only when it is exactly the title, so an edited
 * page whose first heading says something else keeps it.
 */
function withoutTitle(content: string, title: string): string {
  const [first, ...rest] = content.split('\n');
  return first?.trim() === `# ${title}` ? rest.join('\n').trimStart() : content;
}
