'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { PiiPolicy } from '@/generated/prisma/browser';

/**
 * One tint per policy, and the word beside it does the work.
 *
 * `docs/panel-ux-rules.md` rule 26: state is never colour alone. Two folders
 * set to different policies have to read differently with the colour removed,
 * which is why this is a tag and not the tinted shield icon the folder rail
 * used to carry.
 */
const TINT: Record<PiiPolicy, string> = {
  NONE: 'bg-muted text-muted-foreground',
  TOXIC_ONLY: 'bg-pending-tint text-pending dark:bg-pending/30',
  STRICT: 'bg-crimson-50 text-destructive dark:bg-crimson-950/30',
};

const LABEL_KEY: Record<PiiPolicy, string> = {
  NONE: 'badge-none',
  TOXIC_ONLY: 'badge-toxic-only',
  STRICT: 'badge-strict',
};

/**
 * The rail's vocabulary. "All personal data" does not fit a 216px column that
 * also has to show a folder name, and the name is what you are aiming at — a
 * row reading "HR ..." beside a legible policy keeps the wrong half.
 *
 * It is a second surface form of the same policy, not a second policy: the
 * long name travels with it in `title`, so hovering gives the exact wording
 * `docs/panel-ux-rules.md` rule 22 asks for. Both forms are translated
 * together, so one cannot drift from the other.
 */
const SHORT_LABEL_KEY: Record<PiiPolicy, string> = {
  NONE: 'tag-none',
  TOXIC_ONLY: 'tag-toxic-only',
  STRICT: 'tag-strict',
};

const TEST_ID: Record<PiiPolicy, string> = {
  NONE: 'pii-policy-badge-none',
  TOXIC_ONLY: 'pii-policy-badge-toxic-only',
  STRICT: 'pii-policy-badge-strict',
};

export function PiiPolicyBadge({
  piiPolicy,
  /**
   * The rail version: 216px wide, beside a folder name that also has to fit.
   * Same tint and the same `title`, in a smaller box with the short label.
   */
  compact = false,
}: {
  piiPolicy?: PiiPolicy | null;
  compact?: boolean;
}) {
  const t = useTranslations('pii-policy');

  if (!piiPolicy) {
    return null;
  }

  const label = t(LABEL_KEY[piiPolicy]);

  return (
    <span
      data-testid={TEST_ID[piiPolicy]}
      title={label}
      className={cn(
        'inline-flex max-w-full truncate font-medium',
        compact
          ? 'rounded px-1 py-px text-[10px] leading-4'
          : 'rounded-full px-2 py-0.5 text-xs',
        TINT[piiPolicy],
      )}
    >
      {/*
        The short form is shown and the exact policy name is read out. It is a
        second element rather than `aria-label`, which a bare `span` carries no
        role to expose — the tag would have been back to meaning nothing
        without the tint, which is what it replaced.
      */}
      {compact ? (
        <>
          <span aria-hidden="true">{t(SHORT_LABEL_KEY[piiPolicy])}</span>
          <span className="sr-only">{label}</span>
        </>
      ) : (
        label
      )}
    </span>
  );
}
