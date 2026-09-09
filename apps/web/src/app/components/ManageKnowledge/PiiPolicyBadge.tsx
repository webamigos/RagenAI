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
        className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
      >
        {t('badge-none')}
      </span>
    );
  }

  if (piiPolicy === 'TOXIC_ONLY') {
    return (
      <span
        data-testid="pii-policy-badge-toxic-only"
        className="inline-flex rounded-full bg-pending-tint px-2 py-0.5 text-xs font-medium text-pending dark:bg-pending/30"
      >
        {t('badge-toxic-only')}
      </span>
    );
  }

  return (
    <span
      data-testid="pii-policy-badge-strict"
      className="inline-flex rounded-full bg-crimson-50 px-2 py-0.5 text-xs font-medium text-destructive dark:bg-crimson-950/30"
    >
      {t('badge-strict')}
    </span>
  );
}
