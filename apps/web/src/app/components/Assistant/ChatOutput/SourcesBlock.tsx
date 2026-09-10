'use client';

import { useTranslations } from 'next-intl';
import { DocumentTextIcon } from '@heroicons/react/24/outline';

import { cn } from '@/lib/utils';
import { attributableCitations } from '@/features/documents/utils/attributable-citations';
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
 * Cited is decided from the answer text, so it is a claim with a known
 * weakness — see `attributable-citations.ts` for why an ambiguous file name
 * marks nothing rather than everything. Stage 2 replaces the name matching
 * with prompted `[n]` markers and the weakness goes with it.
 *
 * Live turns only. Nothing is persisted yet (gap 5), so a reopened thread has
 * no retrieval to show and this renders nothing — deliberately, rather than an
 * empty block that would read as "searched and found nothing".
 */
type Props = {
  retrieval: MessageRetrieval;
  className?: string;
};

/**
 * How relevant the reranker judged this file, as a bar and a number.
 *
 * Both, because the bar alone is a visual-only encoding and the panel rules
 * say a measure carries a word or a percentage — the same reason the status
 * badge never relies on its colour. The number is also the only version a
 * screen reader can read, which is why the bar itself is `aria-hidden` and the
 * text is not.
 */
const RelevanceBar = ({ score }: { score: number }) => {
  const t = useTranslations('sources');
  // Providers are documented as returning 0–1, but a bar is a layout
  // instruction as well as a claim: an out-of-range value would draw outside
  // its track.
  const fraction = Math.min(Math.max(score, 0), 1);
  const percent = Math.round(fraction * 100);

  return (
    <span
      className="flex shrink-0 items-center gap-1"
      title={`${t('relevance')}: ${percent}%`}
    >
      {/*
        The percentage alone does not say what it measures. `title` is not
        reliably announced and is unreachable by touch, so the label is real
        text, hidden visually because the bar beside it already carries the
        meaning for anyone who can see it.
      */}
      <span className="sr-only">{t('relevance')}: </span>
      <span
        aria-hidden="true"
        className="h-1 w-8 overflow-hidden rounded-full bg-muted"
      >
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {percent}%
      </span>
    </span>
  );
};

export const SourcesBlock = ({ retrieval, className }: Props) => {
  const t = useTranslations('sources');
  const { sources, chunkCount, durationMs, citedFileIds } = retrieval;

  const cited = attributableCitations(sources, citedFileIds);

  return (
    <section
      className={cn('mt-3 border-t border-border pt-2', className)}
      aria-labelledby="sources-heading"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3
          id="sources-heading"
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
          {sources.map((source) => {
            const isCited = cited.has(source.fileId);
            return (
              <li
                key={source.fileId}
                data-cited={isCited}
                className="flex items-center gap-1.5 text-xs"
              >
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
                    `docs/specs/…-functional-gaps.md` gap 3 adds `· page {n}`
                    here once a real page exists to put in it.
                  */}
                  {source.fileName ?? source.fileId}
                </span>
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
