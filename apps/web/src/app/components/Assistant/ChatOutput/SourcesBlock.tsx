'use client';

import { useTranslations } from 'next-intl';
import { DocumentTextIcon } from '@heroicons/react/24/outline';

import { cn } from '@/lib/utils';
import { attributableCitations } from '@/features/documents/utils/attributable-citations';
import { RelevanceBar } from './RelevanceBar';
import type { MessageRetrieval } from '@/store/assistant/assistantSlice';

/**
 * What the answer was grounded in.
 *
 * Gap 2, stage 1. It renders the **retrieved** set — the documents the model
 * was shown — and marks the ones the answer went on to cite. Showing only the
 * cited ones would hide the more useful half: a question that searched five
 * documents and used none of them is a fact about the knowledge base, and an
 * empty block says it better than no block at all.
 *
 * Cited is decided from the answer text. Since stage 2 that is a validated
 * `[n]` marker wherever the model wrote one, and file-name matching only for
 * answers that wrote none — see `cited-sources.ts`. Each row carries its
 * number, and it is the same number the answer cites, so a chip in the prose
 * and a row here are two views of one fact.
 *
 * Live turns only. Nothing is persisted yet (gap 5), so a reopened thread has
 * no retrieval to show and this renders nothing — deliberately, rather than an
 * empty block that would read as "searched and found nothing".
 */
type Props = {
  retrieval: MessageRetrieval;
  /**
   * Namespace for the row ids the `[n]` chips in the answer link to. One per
   * message, because a thread renders many answers and an `id` is unique per
   * document, not per bubble.
   */
  idPrefix: string;
  className?: string;
};

export const SourcesBlock = ({ retrieval, idPrefix, className }: Props) => {
  const t = useTranslations('sources');
  const { sources, chunkCount, durationMs, citedFileIds } = retrieval;

  const cited = attributableCitations(sources, citedFileIds);

  return (
    <section
      className={cn('mt-3 border-t border-border pt-2', className)}
      aria-labelledby={`${idPrefix}-heading`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3
          id={`${idPrefix}-heading`}
          className="text-xs font-medium text-muted-foreground"
        >
          {t('heading')}
        </h3>
        {/*
          The retrieval row. Documents and chunks are both shown because
          neither implies the other — one document usually supplies several
          chunks, and "5 documents · 5 chunks" and "1 document · 5 chunks" are
          different answers to "how much did it look at".
        */}
        {/*
          The counts are ICU plurals, not "{n} documents". Polish needs four
          forms and got one: "Przeszukano 1 dokumentów" is wrong, and so is
          "2 dokumentów". Finnish and Hungarian are the exception — neither
          inflects the noun after a numeral, so marking plurals there would be
          wrong rather than merely redundant, and their strings stay plain.
        */}
        <p className="text-xs text-muted-foreground/70">
          {t('searched-documents', { documents: sources.length })}
          {' · '}
          {t('chunks', { chunks: chunkCount })}
          {' · '}
          {t('duration', { ms: durationMs })}
        </p>
      </div>

      {sources.length === 0 ? (
        // Reached only when retrieval ran and matched nothing. The event is
        // not sent at all when the knowledge base was never searched, so this
        // never stands in for "did not look".
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t('none-found')}
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {sources.map((source, index) => {
            const isCited = cited.has(source.fileId);
            // The same number the answer cites. `sources` arrives deduped and
            // in rank order, and `operations.ts` numbers it by that index, so
            // this is a read of the same fact rather than a second numbering
            // that could disagree with the one the model was given.
            const number = index + 1;
            return (
              <li
                key={source.fileId}
                id={`${idPrefix}-${number}`}
                data-cited={isCited}
                className="flex scroll-mt-24 items-center gap-1.5 rounded text-xs target:bg-accent"
              >
                {/*
                  Crimson, and only here: the panel rules ration it to five
                  jobs and citation markers are one of them. It is the same
                  number, in the same colour, as the chip that points at it,
                  which is the whole reason a reader can follow one to the
                  other.
                */}
                <span
                  aria-hidden="true"
                  className="w-4 shrink-0 text-right font-medium tabular-nums text-marker"
                >
                  {number}
                </span>
                <DocumentTextIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
                <span
                  className={cn(
                    'min-w-0 truncate',
                    isCited ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {/*
                    A chunk ingested before file names were stored has no name
                    to show. It is still listed: it was retrieved, and dropping
                    it would make the count disagree with the list.
                  */}
                  {source.fileName ?? source.fileId}
                </span>
                {/*
                  The page, when the parser knew one — gap 3. Rendered only
                  when present, never defaulted: a document ingested before
                  Docling reported pages has no page, and "page 1" would be a
                  guess wearing the clothes of a fact. This is the same rule
                  the relevance bar follows, and the reason the old
                  `page_number` was renamed after it rendered "page 37" for a
                  twelve-page PDF.

                  Whole page, at least 1, checked here as well as in the
                  chain. This value arrives over the network, and a component
                  should not render a number it cannot justify just because
                  something upstream promised it would not send one. `>= 1`
                  alone let `1.5` and `Infinity` through: neither is a page
                  anyone can turn to, and "page Infinity" is a worse thing to
                  print than nothing.
                */}
                {typeof source.sourcePage === 'number' &&
                Number.isInteger(source.sourcePage) &&
                source.sourcePage >= 1 ? (
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {t('page', { page: source.sourcePage })}
                  </span>
                ) : null}
                {isCited ? (
                  // A word, not a colour: the panel rules say state never
                  // rests on colour alone, and "this one was used" is a state.
                  <span className="shrink-0 text-[11px] text-primary">
                    {t('cited')}
                  </span>
                ) : null}
                {/*
                  No bar when there is no score, rather than an empty one.
                  Reranking is opt-in, so a default installation measures
                  nothing — and an empty bar reads as "scored zero", which is a
                  claim about the document rather than about the deployment.
                  This is the same rule as `source_page`: a field is rendered
                  only when it holds something true.
                */}
                {typeof source.relevanceScore === 'number' ? (
                  <RelevanceBar score={source.relevanceScore} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
