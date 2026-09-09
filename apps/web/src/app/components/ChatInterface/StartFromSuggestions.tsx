'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

/**
 * Four ways into an empty thread.
 *
 * Phase 5 of design system v2, gap 11. **The copy is static**, decided rather
 * than defaulted: generated suggestions need a source of candidate questions
 * and a reason to trust them, and per-assistant copy needs somewhere to author
 * it. Both are a feature, not a card. Static text is honest about being an
 * example and can be rewritten by anyone editing a locale file.
 *
 * Each prompt carries a `[placeholder]` on purpose. A card that inserted a
 * complete, sendable question would be answered as-is by people who meant to
 * edit it, and the answer would be about nothing. The bracket says "your turn"
 * without needing a line of instructions to say it.
 *
 * Clicking fills the composer; it does not send. Choosing an example is not
 * the same as having asked a question.
 */
const SUGGESTIONS = ['summarize', 'explain', 'analyze', 'write'] as const;

type Props = {
  /** Fills the composer with this text. Never sends it. */
  onSelect: (prompt: string) => void;
  className?: string;
};

export const StartFromSuggestions = ({ onSelect, className }: Props) => {
  const t = useTranslations('Index');

  return (
    <section
      className={cn('mt-6', className)}
      aria-labelledby="start-from-heading"
    >
      <h2
        id="start-from-heading"
        className="mb-2 text-xs font-medium text-muted-foreground"
      >
        {t('start-from')}
      </h2>

      {/*
        `auto-fit` with a 280px floor rather than a stack of breakpoints: the
        composer is capped at max-w-3xl, so this lands on two columns on a
        desktop and one on a phone without asking what the viewport is. Four
        cards over three columns would leave an orphan on the second row.

        The `min(280px,100%)` is not decoration. A bare `minmax(280px,1fr)`
        makes 280px a hard floor for the track, so in a container narrower than
        that the grid overflows instead of shrinking — on a 375px phone the
        cards ran past the page edge and squeezed the composer to a third of
        its width. `min()` lets the track collapse to the container.
      */}
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-2">
        {SUGGESTIONS.map((slug) => {
          const prompt = t(`suggestion-${slug}-prompt`);
          return (
            <li key={slug}>
              <button
                type="button"
                onClick={() => onSelect(prompt)}
                className={cn(
                  'w-full rounded-lg border border-border bg-card px-3.5 py-3 text-left',
                  'transition-colors hover:bg-muted',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                )}
              >
                <span className="block text-sm font-medium text-foreground">
                  {t(`suggestion-${slug}`)}
                </span>
                {/*
                  The prompt is shown as well as inserted, so the card is not a
                  guess about what clicking it will do.
                */}
                <span className="mt-1 block text-xs text-muted-foreground">
                  {prompt}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
