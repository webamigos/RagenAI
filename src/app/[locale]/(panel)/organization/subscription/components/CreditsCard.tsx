import { format } from 'date-fns';
import { getTranslations } from 'next-intl/server';
import type { CreditsSummary } from '@/features/credits/services/queries/get-credits-summary-query';

type Props = {
  summary: CreditsSummary;
};

export async function CreditsCard({ summary }: Props) {
  const t = await getTranslations('subscription.credits');

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-zinc-950 dark:text-white">
          {t('title')}
        </h3>
        <div className="flex items-baseline gap-1">
          <span
            className="text-3xl font-bold tabular-nums text-zinc-950 dark:text-white"
            data-testid="credits-balance"
          >
            {summary.balance.toLocaleString()}
          </span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('balance').toLowerCase()}
          </span>
        </div>
      </div>

      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        {t('description')}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {summary.planMonthlyCredits !== null && (
          <Stat
            label={t('monthly-grant')}
            value={summary.planMonthlyCredits.toLocaleString()}
          />
        )}
        <Stat
          label={t('next-reset')}
          value={
            summary.nextResetAt
              ? format(summary.nextResetAt, 'dd.MM.yyyy')
              : t('no-reset')
          }
        />
        <Stat
          label={t('lifetime-spent')}
          value={summary.lifetimeSpent.toLocaleString()}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 font-medium text-zinc-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}
