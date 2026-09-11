'use client';

import { useTranslations } from 'next-intl';
import { XMarkIcon } from '@heroicons/react/20/solid';

import { cn } from '@/lib/utils';
import { attributableCitations } from '@/features/documents/utils/attributable-citations';
import type { ApiSseRetrievedSource } from '@/features/threads/contracts/events.types';
import type { MessageRetrieval } from '@/store/assistant/assistantSlice';
import { RelevanceBar } from './RelevanceBar';

/**
 * What the last answer was grounded in, as a panel beside the conversation.
 *
 * Design system v2 phase 6, part 5. It is **not** a wider sources block: the
 * block under an answer says which documents that answer used, and this says
 * how deeply each one was read — the chunk count and the pages, which is the
 * half a single row has no room for and which nothing was carrying until the
 * chain stopped discarding it.
 *
 * One turn, not the thread. Every figure here — the rank, the score, the
 * depth — describes one retrieval, and merging several turns would produce a
 * card whose number belongs to one question and whose score belongs to
 * another. The rail follows the newest answer, which is the one the reader is
 * looking at.
 */
type Props = {
  retrieval: MessageRetrieval;
  onClose: () => void;
};

/**
 * `3 chunks · pages 2, 4, 9`, or just the chunks when no page is known.
 *
 * The page list is rendered only when the parser supplied one. A file from a
 * legacy loader or an unpaginated format carries no pages at all, and the
 * alternative — "pages —" or an invented page 1 — is the mistake `page_number`
 * already made once.
 */
const SourceDepth = ({ source }: { source: ApiSseRetrievedSource }) => {
  const t = useTranslations('sources');
  const pages = source.pages?.filter(
    (page) => Number.isInteger(page) && page >= 1,
  );

  return (
    <p className="mt-1 text-[11px] text-muted-foreground">
      {t('chunks', { chunks: source.chunkCount })}
      {pages && pages.length > 0 ? (
        <>
          {' · '}
          {/*
            A list, not a range. "pages 2-9" would claim every page between
            them was read, and the chunks a rerank keeps are rarely
            contiguous.
          */}
          {t('pages', { pages: pages.join(', '), count: pages.length })}
        </>
      ) : null}
    </p>
  );
};

export const SourcesRail = ({ retrieval, onClose }: Props) => {
  const t = useTranslations('sources');
  const { sources, citedFileIds } = retrieval;
  const cited = attributableCitations(sources, citedFileIds);

  return (
    <aside
      aria-label={t('heading')}
      className="hidden w-[296px] shrink-0 flex-col overflow-y-auto border-l border-border/40 bg-muted/20 lg:flex"
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/40 bg-background/80 px-4 py-2.5 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-foreground">
          {t('heading')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t('document-count', { documents: sources.length })}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close-rail')}
          className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <XMarkIcon className="size-4" />
        </button>
      </div>

      {sources.length === 0 ? (
        // Retrieval ran and matched nothing. The rail is only ever shown for a
        // turn that searched, so this never stands in for "did not look".
        <p className="px-4 py-3 text-xs text-muted-foreground">
          {t('none-found')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2 p-3">
          {sources.map((source, index) => {
            const isCited = cited.has(source.fileId);
            // The same number the answer cites and the same number the sources
            // block shows, for the same reason: `sources` is deduped and in
            // final rank order, so the index *is* the citation number. A
            // second numbering here would be free to disagree with the one the
            // model was given.
            const number = index + 1;

            return (
              <li
                key={source.fileId}
                data-cited={isCited}
                className="rounded-lg border border-border bg-card p-2.5"
              >
                <div className="flex items-start gap-2">
                  {/*
                    Crimson, and one of the five jobs the panel rules allow it:
                    this is a citation marker, the same glyph in the same
                    colour as the chip in the prose.
                  */}
                  <span
                    aria-hidden="true"
                    className="mt-px flex size-4 shrink-0 items-center justify-center rounded bg-crimson-50 text-[10px] font-semibold tabular-nums text-marker dark:bg-crimson-950/30"
                  >
                    {number}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 break-words text-xs leading-snug',
                      isCited
                        ? 'font-medium text-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    {/*
                      A chunk ingested before file names were stored has no
                      name. It is still listed — it was retrieved, and dropping
                      it would make the count disagree with the list.
                    */}
                    {source.fileName ?? source.fileId}
                  </span>
                </div>

                {/*
                  No bar when there is no score, rather than an empty one.
                  Reranking is opt-in, so a default installation measures
                  nothing — and an empty bar reads as "this document scored
                  zero", which is a claim about the document where the truth is
                  a fact about the deployment. Absence means "not measured";
                  `0` is a real score and still draws a bar.
                */}
                {typeof source.relevanceScore === 'number' ? (
                  <RelevanceBar
                    score={source.relevanceScore}
                    className="mt-1.5 flex w-full justify-between gap-2"
                    trackClassName="flex-1"
                  />
                ) : null}

                <SourceDepth source={source} />

                {isCited ? (
                  // A word, not a colour — state never rests on colour alone.
                  <p className="mt-1 text-[11px] text-primary">{t('cited')}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
};
