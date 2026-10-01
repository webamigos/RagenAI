'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { useRouter } from '@/i18n/routing';
import {
  deleteAllMembersMemoriesAction,
  type OrgMemoryPageData,
} from '../actions';

type Props = { data: OrgMemoryPageData };

/**
 * "Delete all members' memories" (spec
 * 2026-09-27-personal-memory-across-threads, B3). An admin can erase them
 * and cannot read them; the section says so.
 */
export function OrgMemorySection({ data }: Props) {
  const t = useTranslations('organization-page.rag-settings');
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const deleteAll = () => {
    setConfirming(false);
    startTransition(async () => {
      try {
        await deleteAllMembersMemoriesAction();
        toast.success(t('org-memory-deleted'));
        router.refresh();
      } catch {
        toast.error(t('org-memory-error'));
      }
    });
  };

  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground">
        {t('org-memory-title')}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('org-memory-description')}
      </p>
      {data.hasMemories ? (
        <>
          <Button
            className="mt-3"
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() => setConfirming(true)}
          >
            {t('org-memory-delete')}
          </Button>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={t('org-memory-confirm-title')}
            description={t('org-memory-confirm-description')}
            confirmLabel={t('org-memory-delete')}
            destructive
            onConfirm={deleteAll}
          />
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {t('org-memory-none')}
        </p>
      )}
    </section>
  );
}
