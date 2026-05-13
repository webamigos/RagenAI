'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

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

  const options: {
    value: PiiPolicyValue;
    label: string;
    description: string;
  }[] = [
    {
      value: 'NONE',
      label: t('none-label'),
      description: t('none-description'),
    },
    {
      value: 'TOXIC_ONLY',
      label: t('toxic-only-label'),
      description: t('toxic-only-description'),
    },
    {
      value: 'STRICT',
      label: t('strict-label'),
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
        className={`${compact ? '' : 'w-full'} rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 focus:border-indigo-600 focus:ring-indigo-600`}
        aria-label={t('select-label')}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {!compact && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {options.find((o) => o.value === value)?.description}
        </p>
      )}
      {!compact && showInfoLink && (
        <Link
          href="/settings/pii-policy"
          className="mt-1 inline-block text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {t('learn-more')}
        </Link>
      )}
    </div>
  );
}
