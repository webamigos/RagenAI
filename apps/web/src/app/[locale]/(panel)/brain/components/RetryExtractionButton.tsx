'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { retryExtractionFindingAction } from '../actions';

/**
 * Re-run extraction for the one document a failed finding names (spec D3).
 * The finding stays until the worker has extracted the document, so after a
 * click the button says the retry is queued instead of pretending it is
 * resolved.
 */
export function RetryExtractionButton({
  findingPublicId,
}: {
  findingPublicId: string;
}) {
  const t = useTranslations('brain.extract');
  const [pending, startTransition] = useTransition();
  const [queued, setQueued] = useState(false);

  if (queued) {
    return (
      <span className="text-xs text-muted-foreground">{t('retry-queued')}</span>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await retryExtractionFindingAction({
            findingPublicId,
          });
          if (result.success) {
            setQueued(true);
            toast.success(t('retry-started'));
            return;
          }
          toast.error(t(`errors.${result.error}`));
        })
      }
    >
      {t('retry')}
    </Button>
  );
}
