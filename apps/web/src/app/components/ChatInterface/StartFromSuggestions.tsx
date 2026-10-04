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
 *
 * **Secondary on purpose.** The composer is the page on a new chat (panel UX
 * rule 6). Four bordered cards, each with a title and a two-line prompt,
 * outweighed it, so they are one row of quiet chips: the title only, muted
 * until hovered, with the full prompt as the chip's tooltip. The prompt no
 * longer has to be printed on the card to keep the click from being a guess —
 * clicking sends nothing, so the prompt appears in the composer, editable, the
 * moment it is chosen.
 */
const SUGGESTIONS = ['summarize', 'explain', 'analyze', 'write'] as const;

type Props = {
  /** Fills the composer with this text. Never sends it. */
  onSelect: (prompt: string) => void;
  /**
   * Hidden once the composer holds a draft — the chips would be offering to
   * replace it. Hidden, **not unmounted**: the row keeps its height, so the
   * composer above it does not move when the first character is typed. The
   * empty state is centred in the pane, and unmounting the row changed the
   * block's height and so moved the input by half of it.
   */
  hidden?: boolean;
  className?: string;
};

export const StartFromSuggestions = ({
  onSelect,
  hidden = false,
  className,
}: Props) => {
  const t = useTranslations('Index');

  return (
    <section
      className={cn(
        'mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5',
        // Fades rather than blinks. `visibility` is transitioned with the
        // opacity so it flips at the end of the fade, not the start; with
        // reduced motion both change at once.
        'motion-safe:transition-[opacity,visibility] motion-safe:duration-150',
        hidden && 'invisible opacity-0',
        className,
      )}
      aria-labelledby="start-from-heading"
      // `invisible` already hides it from assistive tech in a browser; `inert`
      // takes the chips out of the tab order and makes that explicit.
      aria-hidden={hidden || undefined}
      inert={hidden}
      data-state={hidden ? 'hidden' : 'visible'}
    >
      <h2 id="start-from-heading" className="text-xs text-muted-foreground">
        {t('start-from')}
      </h2>

      <ul className="flex flex-wrap justify-center gap-1.5">
        {SUGGESTIONS.map((slug) => {
          const prompt = t(`suggestion-${slug}-prompt`);
          return (
            <li key={slug}>
              <button
                type="button"
                onClick={() => onSelect(prompt)}
                title={prompt}
                className={cn(
                  // 32px tall: the hit-target floor outside toolbars (rule 26).
                  'inline-flex min-h-8 items-center rounded-full border border-border px-3 text-xs text-muted-foreground',
                  'transition-colors hover:bg-muted hover:text-foreground',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                )}
              >
                {t(`suggestion-${slug}`)}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
