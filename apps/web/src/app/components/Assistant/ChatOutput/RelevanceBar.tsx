'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

/**
 * How relevant the reranker judged this file, as a bar and a number.
 *
 * Both, because the bar alone is a visual-only encoding and the panel rules
 * say a measure carries a word or a percentage — the same reason the status
 * badge never relies on its colour. The number is also the only version a
 * screen reader can read, which is why the bar itself is `aria-hidden` and the
 * text is not.
 *
 * Shared by the sources block and the sources rail rather than written twice.
 * Two copies would be free to disagree about the one thing that matters here:
 * that a score of `0` still draws a bar and reads "0%", while a score that was
 * never taken draws nothing at all. Neither component decides that — they
 * decide whether to render this component, and it decides the rest.
 */
export const RelevanceBar = ({
  score,
  className,
  /** The rail has room for a wider track than a row in the block does. */
  trackClassName = 'w-8',
}: {
  score: number;
  className?: string;
  trackClassName?: string;
}) => {
  const t = useTranslations('sources');
  // Providers are documented as returning 0–1, but a bar is a layout
  // instruction as well as a claim: an out-of-range value would draw outside
  // its track.
  const fraction = Math.min(Math.max(score, 0), 1);
  const percent = Math.round(fraction * 100);

  return (
    <span
      className={cn('flex shrink-0 items-center gap-1', className)}
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
        className={cn(
          'h-1 overflow-hidden rounded-full bg-muted',
          trackClassName,
        )}
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
