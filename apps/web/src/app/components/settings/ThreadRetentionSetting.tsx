'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  THREAD_RETENTION_DAYS_OPTIONS,
  isThreadRetentionTightening,
  type ThreadRetentionDays,
} from '@ragenai/platform-contracts';

import { saveThreadRetentionAction } from '@/app/actions';
import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { statusToast } from '@/app/lib/utils/toast';
import { Button } from '@/components/ui/button';
import type { SaveThreadRetentionError } from '@/features/organizations/contracts/thread-retention.types';

type Props = {
  /** The stored period, or `null` for off. Read on the server. */
  initialDays: ThreadRetentionDays | null;
};

type Choice = ThreadRetentionDays | null;

const CHOICES: readonly Choice[] = [null, ...THREAD_RETENTION_DAYS_OPTIONS];

/**
 * The organization's thread retention period (spec 2026-10-17, B4).
 *
 * Saved with a button rather than on change, because the two directions are
 * not alike: turning retention on or shortening it deletes conversations at
 * the next daily run and asks for confirmation first, while turning it off or
 * lengthening it deletes nothing that was not already going and saves
 * directly.
 */
export function ThreadRetentionSetting({ initialDays }: Props) {
  const t = useTranslations('thread-retention');
  const [saved, setSaved] = useState<Choice>(initialDays);
  const [selected, setSelected] = useState<Choice>(initialDays);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { successToast, errorToast } = statusToast();

  const errorMessage = (error: SaveThreadRetentionError): string => {
    switch (error) {
      case 'invalid-period':
        return t('error-invalid-period');
      case 'forbidden':
        return t('error-forbidden');
      case 'settings-locked':
        return t('error-settings-locked');
      case 'save-failed':
        return t('error-save-failed');
    }
  };

  const save = (next: Choice) => {
    startTransition(async () => {
      try {
        const result = await saveThreadRetentionAction(next);
        if (!result.success) {
          errorToast({ message: errorMessage(result.error) });
          return;
        }
        setSaved(result.threadRetentionDays);
        setSelected(result.threadRetentionDays);
        successToast({
          message:
            result.threadRetentionDays === null
              ? t('saved-off')
              : t('saved-on', { days: result.threadRetentionDays }),
        });
      } catch {
        errorToast({ message: t('error-save-failed') });
      }
    });
  };

  const handleSave = () => {
    if (isThreadRetentionTightening(saved, selected)) {
      setConfirming(true);
      return;
    }
    save(selected);
  };

  const labelFor = (choice: Choice) =>
    choice === null ? t('option-off') : t('option-days', { days: choice });

  const descriptionFor = (choice: Choice) =>
    choice === null
      ? t('option-off-description')
      : t('option-days-description', { days: choice });

  return (
    <div className="space-y-4">
      <div>
        <h3
          id="thread-retention-label"
          className="text-sm font-semibold text-foreground"
        >
          {t('title')}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t('what-is-deleted')}</li>
          <li>{t('which-threads')}</li>
          <li>{t('when')}</li>
        </ul>
      </div>

      <p
        className="text-sm text-foreground"
        data-testid="thread-retention-current"
      >
        {saved === null ? t('current-off') : t('current-on', { days: saved })}
      </p>

      <div
        role="radiogroup"
        aria-labelledby="thread-retention-label"
        className="space-y-2"
      >
        {CHOICES.map((choice) => (
          <label
            key={choice ?? 'off'}
            className="flex min-h-8 cursor-pointer items-start gap-3 rounded-md border border-border p-3"
          >
            <input
              type="radio"
              name="thread-retention"
              value={choice ?? 'off'}
              checked={selected === choice}
              onChange={() => setSelected(choice)}
              disabled={isPending}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">
                {labelFor(choice)}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                {descriptionFor(choice)}
              </span>
            </span>
          </label>
        ))}
      </div>

      <Button
        type="button"
        onClick={handleSave}
        disabled={isPending || selected === saved}
      >
        {isPending ? t('saving') : t('save')}
      </Button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={selected === null ? '' : t('confirm-title', { days: selected })}
        description={
          selected === null ? '' : t('confirm-description', { days: selected })
        }
        confirmLabel={
          selected === null
            ? undefined
            : t('confirm-action', { days: selected })
        }
        destructive
        onConfirm={() => {
          setConfirming(false);
          save(selected);
        }}
      />
    </div>
  );
}
