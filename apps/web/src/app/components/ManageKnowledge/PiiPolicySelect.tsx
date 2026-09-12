'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export type PiiPolicyValue = 'NONE' | 'TOXIC_ONLY' | 'STRICT';

type Props = {
  value: PiiPolicyValue;
  onChange: (value: PiiPolicyValue) => void;
  disabled?: boolean;
  id?: string;
  compact?: boolean;
  showInfoLink?: boolean;
};

export function PiiPolicySelect({
  value,
  onChange,
  disabled,
  id,
  compact,
  showInfoLink = false,
}: Props) {
  const generatedId = useId();
  const t = useTranslations('pii-policy');

  /*
    Compact takes the badge names, full takes the long ones.

    A form has room to say "None — keep all data" and to print the
    description under it. The knowledge base's policy column has 168px, where
    the same string renders as "None — keep ..." — a select whose options all
    trail off tells you nothing three files apart.

    The short forms are `badge-*` rather than a third set of words: the folder
    tag in the rail and the Policy filter chip already render those, and panel
    rule 22 asks the PII copy to name a policy the same way everywhere. A cell
    reading "Sensitive data" under a chip reading "Sensitive data" is the
    point.
  */
  const options: {
    value: PiiPolicyValue;
    label: string;
    description: string;
  }[] = [
    {
      value: 'NONE',
      label: compact ? t('badge-none') : t('none-label'),
      description: t('none-description'),
    },
    {
      value: 'TOXIC_ONLY',
      label: compact ? t('badge-toxic-only') : t('toxic-only-label'),
      description: t('toxic-only-description'),
    },
    {
      value: 'STRICT',
      label: compact ? t('badge-strict') : t('strict-label'),
      description: t('strict-description'),
    },
  ];

  return (
    <div>
      <select
        id={id ?? generatedId}
        value={value}
        onChange={(e) => onChange(e.target.value as PiiPolicyValue)}
        disabled={disabled}
        className={cn(
          'rounded-md border border-border dark:border-border dark:bg-muted dark:text-foreground focus:border-brand-600 focus:ring-brand-600',
          compact
            ? // The 24px quiet select phase 7 asks for. It fills its cell
              // rather than carrying a fixed cap: the column is 168px and
              // bounds it already, and a 140px cap inside a 144px box was
              // four pixels short of "All personal data" — the one option
              // that has to fit, because it is the strictest.
              'h-6 w-full truncate px-1.5 py-0 text-xs'
            : 'w-full px-2 py-1 text-sm',
        )}
        aria-label={t('select-label')}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {!compact && (
        <p className="mt-1 text-xs text-muted-foreground">
          {options.find((o) => o.value === value)?.description}
        </p>
      )}
      {!compact && showInfoLink && (
        <Link
          href="/organization/pii-policy"
          className="mt-1 inline-block text-xs text-brand-600 hover:underline dark:text-brand-400"
        >
          {t('learn-more')}
        </Link>
      )}
    </div>
  );
}
