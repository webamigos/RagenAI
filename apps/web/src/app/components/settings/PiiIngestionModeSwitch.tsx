'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { PiiIngestionMode } from '@/features/organizations/contracts/organization.types';
import { savePiiIngestionModeAction } from '@/app/actions';
import { statusToast } from '@/app/lib/utils/toast';

type Props = {
  initialMode: PiiIngestionMode;
};

export function PiiIngestionModeSwitch({ initialMode }: Props) {
  const t = useTranslations('pii-policy');
  const [mode, setMode] = useState<PiiIngestionMode>(initialMode);
  const [isPending, startTransition] = useTransition();
  const { successToast, errorToast } = statusToast();

  function handleChange(newMode: PiiIngestionMode) {
    const previousMode = mode;
    setMode(newMode);
    startTransition(async () => {
      try {
        await savePiiIngestionModeAction(newMode);
        successToast({ message: t('ingestion-mode-saved') });
      } catch {
        setMode(previousMode);
        errorToast({ message: t('ingestion-mode-error') });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h3
          id="pii-ingestion-mode-label"
          className="text-sm font-semibold text-zinc-950 dark:text-white"
        >
          {t('ingestion-mode-title')}
        </h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t('ingestion-mode-description')}
        </p>
      </div>

      <div
        role="group"
        aria-labelledby="pii-ingestion-mode-label"
        className={`space-y-3${isPending ? ' opacity-60 pointer-events-none' : ''}`}
      >
        {(['destructive', 'dual_content'] as const).map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"
          >
            <input
              type="radio"
              name="pii-ingestion-mode"
              value={option}
              checked={mode === option}
              onChange={() => handleChange(option)}
              disabled={isPending}
              className="mt-0.5 accent-[#cb1d3d]"
            />
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {t(
                  option === 'destructive'
                    ? 'ingestion-mode-destructive-label'
                    : 'ingestion-mode-dual-content-label',
                )}
              </p>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {t(
                  option === 'destructive'
                    ? 'ingestion-mode-destructive-description'
                    : 'ingestion-mode-dual-content-description',
                )}
              </p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
