'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/routing';

import { publishAllApprovedAction } from '../actions';

/**
 * Publish every approved page not already serving its current text (spec
 * E7). Asks first — it writes one ledger row per page — and reports what it
 * did in three numbers, so "nothing happened" and "everything was refused"
 * never look the same.
 */
export function PublishAllButton({ approved }: { approved: number }) {
  const t = useTranslations('brain.publish-all');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (approved === 0) {
    return null;
  }
  const run = () =>
    startTransition(async () => {
      const result = await publishAllApprovedAction();
      if ('error' in result) {
        toast.error(t('failed'));
        return;
      }
      const refused = Object.values(result.refused).reduce(
        (a, b) => a + (b ?? 0),
        0,
      );
      const summary = t('done', {
        queued: result.queued,
        unchanged: result.unchanged,
        refused,
      });
      // A page recorded as published whose index write never queued is not
      // a success, whatever the other numbers say.
      if (result.notWritten > 0) {
        toast.error(t('not-written', { count: result.notWritten }), {
          description: summary,
        });
      } else {
        toast.success(summary);
      }
      router.refresh();
    });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        {t('button', { count: approved })}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('confirm-title')}
        description={t('confirm-description')}
        confirmLabel={t('confirm')}
        onConfirm={run}
      />
    </>
  );
}
