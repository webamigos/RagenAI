'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { BoltIcon } from '@heroicons/react/24/outline';

type Props = {
  balance: number;
};

/**
 * Compact balance indicator in the lead-list header. Links to the
 * subscription page so users can see the full breakdown and top up. The
 * value here is the snapshot at page load — bulk actions revalidate the
 * page after running, which refreshes this chip.
 */
export function CreditsChip({ balance }: Props) {
  const t = useTranslations('subscription.credits');
  const low = balance < 50;

  return (
    <Link
      href="/organization/subscription"
      title={t('description')}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        low
          ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50'
          : 'border-zinc-300 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
      }`}
    >
      <BoltIcon className="size-3.5" />
      <span className="tabular-nums" data-testid="credits-chip-balance">
        {balance.toLocaleString()}
      </span>
      <span className="hidden lg:inline">{t('balance').toLowerCase()}</span>
    </Link>
  );
}
