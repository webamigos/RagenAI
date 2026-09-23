'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import type { BrainDocument } from '@/features/brain/contracts/brain-documents.types';
import { useRouter } from '@/i18n/routing';

import { sendStagedToKnowledgeBaseAction } from '@/app/actions/bulk-documents';

import {
  restoreSourceDocumentAction,
  withdrawSourceDocumentAction,
} from '../actions';

/**
 * Take a document out of retrieval, or put it back (spec E9). Out needs an
 * approved page citing the document, and asks first; back re-runs ingest and
 * needs no confirmation, because it only widens what answers can draw on to
 * what the document already said.
 */
export function DocumentRetrievalActions({
  fileId,
  fileName,
  retrieval,
  curated,
}: {
  fileId: string;
  fileName: string;
  retrieval: BrainDocument['retrieval'];
  curated: boolean;
}) {
  const t = useTranslations('brain.documents');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const act = (action: typeof withdrawSourceDocumentAction, success: string) =>
    startTransition(async () => {
      const result = await action({ fileId });
      if (result.success) {
        toast.success(success);
        router.refresh();
        return;
      }
      toast.error(t(`errors.${result.error}`));
    });

  if (retrieval === 'staged') {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await sendStagedToKnowledgeBaseAction([fileId]);
            if (result.sent.length > 0) {
              toast.success(t('sent'));
              router.refresh();
              return;
            }
            toast.error(t('errors.failed-to-start'));
          })
        }
      >
        {t('send')}
      </Button>
    );
  }
  if (retrieval === 'withdrawn') {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => act(restoreSourceDocumentAction, t('restored'))}
      >
        {t('restore')}
      </Button>
    );
  }
  if (retrieval !== 'in') {
    return null;
  }
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || !curated}
        title={curated ? undefined : t('needs-approved')}
        onClick={() => setConfirming(true)}
      >
        {t('withdraw')}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('withdraw-title')}
        description={t('withdraw-description', { name: fileName })}
        confirmLabel={t('withdraw')}
        onConfirm={() => act(withdrawSourceDocumentAction, t('withdrawn'))}
      />
    </>
  );
}
