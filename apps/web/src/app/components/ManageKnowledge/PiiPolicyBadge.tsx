'use client';

import { useTranslations } from 'next-intl';
import type { PiiPolicy } from '@/generated/prisma/browser';

export function PiiPolicyBadge({
  piiPolicy,
}: {
  piiPolicy?: PiiPolicy | null;
}) {
  const t = useTranslations('pii-policy');

  if (!piiPolicy) {
    return null;
  }

  if (piiPolicy === 'NONE') {
    return (
      <span
        data-testid="pii-policy-badge-none"
        className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400"
      >
        {t('badge-none')}
      </span>
    );
  }

  if (piiPolicy === 'TOXIC_ONLY') {
    return (
      <span
        data-testid="pii-policy-badge-toxic-only"
        className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      >
        {t('badge-toxic-only')}
      </span>
    );
  }

  return (
    <span
      data-testid="pii-policy-badge-strict"
      className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
    >
      {t('badge-strict')}
    </span>
  );
}
