'use client';

import { useTranslations } from 'next-intl';
import {
  ANALYTICS_PERIODS,
  type AnalyticsPeriod,
} from '@/features/documents/contracts/knowledge-analytics.types';

type Props = {
  value: AnalyticsPeriod;
  onChange: (period: AnalyticsPeriod) => void;
  disabled?: boolean;
};

/**
 * One window for the whole screen.
 *
 * Before this, three of the five panels used a hard-coded 30 days and "Top
 * cited" used all of history, so a document heavily cited in March outranked
 * one cited all week — on a page whose other sections disagreed with it.
 *
 * "Documents unused for 90+ days" deliberately does **not** follow this
 * selector: at seven days, "not cited in the last week" is very nearly every
 * document, and the panel would stop meaning anything. It states its own
 * threshold in its heading instead of silently ignoring the selection.
 */
export function PeriodSelector({ value, onChange, disabled }: Props) {
  const t = useTranslations('settings-page.knowledge-analytics.period');

  return (
    <div
      role="group"
      aria-label={t('label')}
      className="inline-flex items-center rounded-lg border bg-card p-0.5"
    >
      {ANALYTICS_PERIODS.map((period) => (
        <button
          key={period}
          type="button"
          onClick={() => onChange(period)}
          disabled={disabled}
          aria-pressed={value === period}
          data-testid={`period-${period}`}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors disabled:opacity-50 ${
            value === period
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('days', { count: period })}
        </button>
      ))}
    </div>
  );
}
