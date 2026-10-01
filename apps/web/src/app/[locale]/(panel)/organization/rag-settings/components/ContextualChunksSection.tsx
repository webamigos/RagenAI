'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { useRouter } from '@/i18n/routing';
import {
  reindexForContextAction,
  type ContextualChunksPageData,
} from '../actions';

type Props = {
  data: ContextualChunksPageData;
};

/**
 * How many documents carry the context prefix, and a re-index for the rest
 * (spec 2026-09-29-contextual-chunks, C1). The button shows only when there
 * is something to re-index and the key that writes the prefix is on.
 */
export function ContextualChunksSection({ data }: Props) {
  const t = useTranslations('organization-page.rag-settings');
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { enabled, status } = data;

  const countLine = (): string => {
    if (status === null) {
      return t('contextual-unavailable');
    }
    if (status.indexed === 0) {
      return t('contextual-none-indexed');
    }
    return t('contextual-count', {
      current: status.indexed - status.stale,
      total: status.indexed,
    });
  };

  const reindex = () => {
    setConfirming(false);
    startTransition(async () => {
      try {
        const { started, failed } = await reindexForContextAction();
        if (failed > 0) {
          toast.error(t('contextual-partial', { failed, started }));
        } else {
          toast.success(t('contextual-started', { count: started }));
        }
        router.refresh();
      } catch {
        toast.error(t('contextual-error'));
      }
    });
  };

  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground">
        {t('contextual-title')}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('contextual-description')}
      </p>

      <p className="mt-3 text-sm text-foreground">{countLine()}</p>

      {!enabled && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t('contextual-off')}
        </p>
      )}

      {enabled && status !== null && status.stale > 0 && (
        <>
          <Button
            className="mt-3"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => setConfirming(true)}
          >
            {t('contextual-reindex-button', { count: status.stale })}
          </Button>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={t('contextual-confirm-title', { count: status.stale })}
            description={t('contextual-confirm-description')}
            confirmLabel={t('contextual-confirm-action')}
            onConfirm={reindex}
          />
        </>
      )}
    </section>
  );
}
