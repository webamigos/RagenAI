import { cn } from '@/lib/utils';

/**
 * The one way a document or job state is shown.
 *
 * Design system v2, phase 3. It replaces the ad-hoc pills that had grown up
 * per table — same four states, four different spellings of them, and the two
 * that mattered were failing contrast: `--color-pending` over
 * `--color-pending-tint` measures **1.98:1**, on the Processing pill in the
 * file table, which is the most-used status in the product. `--color-ready`
 * over its tint measures 3.07:1. Both are below AA at any size, let alone at
 * 11px.
 *
 * `ready-strong` and `pending-strong` are those hues taken dark enough to
 * read — 12.99:1 and 17.73:1 — and they stay chromatic rather than going
 * near-black so the state is still green or amber, not just a coloured dot.
 *
 * **State never rests on colour alone** (`docs/panel-ux-rules.md`), so the
 * label is always a word. There is deliberately no percentage: the badge
 * contract had an optional one, and the ingest workflow reports no progress
 * that means anything — its seven activities differ by orders of magnitude and
 * embedding dominates, so "3 of 7" would sit at 43% with nearly all the work
 * ahead. See Q4 in `docs/specs/2026-09-09-design-system-v2-functional-gaps.md`.
 */
export type StatusBadgeState = 'ready' | 'processing' | 'failed' | 'queued';

const STATE_STYLES: Record<StatusBadgeState, { pill: string; dot: string }> = {
  ready: {
    pill: 'bg-ready-tint text-ready-strong dark:bg-ready/20 dark:text-ready',
    dot: 'bg-ready',
  },
  processing: {
    pill: 'bg-pending-tint text-pending-strong dark:bg-pending/20 dark:text-pending',
    dot: 'bg-pending animate-pulse',
  },
  failed: {
    pill: 'bg-crimson-50 text-destructive dark:bg-crimson-950/30',
    dot: 'bg-destructive',
  },
  queued: {
    // `text-muted-foreground` is the design's choice and measures 4.38:1 on
    // `bg-muted` — under AA for 11px by a hair. The state reads as the quiet
    // one from its neutral fill and its paper-400 dot; it does not also need
    // an unreadable label to say so.
    pill: 'bg-muted text-foreground',
    dot: 'bg-paper-400',
  },
};

type Props = {
  state: StatusBadgeState;
  /** Always a word. The caller translates it; this component never does. */
  label: string;
  className?: string;
  'data-testid'?: string;
};

export function StatusBadge({
  state,
  label,
  className,
  'data-testid': testId,
}: Props) {
  const styles = STATE_STYLES[state];

  return (
    <span
      // `role="status"` would announce every row of a table on load. The state
      // is a property of the row, not an event, so it is read as text.
      data-state={state}
      data-testid={testId}
      className={cn(
        'inline-flex h-5 items-center gap-1.5 rounded-[4px] px-2 text-[11px] font-medium',
        styles.pill,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-[5px] shrink-0 rounded-full', styles.dot)}
      />
      {label}
    </span>
  );
}
