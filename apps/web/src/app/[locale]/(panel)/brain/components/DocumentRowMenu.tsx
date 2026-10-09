'use client';

import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { TouchTarget } from '@ragenai/common-ui/TouchTarget';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { sendStagedToKnowledgeBaseAction } from '@/app/actions/bulk-documents';
import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { BrainDocument } from '@/features/brain/contracts/brain-documents.types';
import { useRouter } from '@/i18n/routing';

import {
  restoreSourceDocumentAction,
  retryExtractionFindingAction,
  withdrawSourceDocumentAction,
} from '../actions';

/**
 * A source document's actions behind one "⋯" (panel rule 12): retry a failed
 * extraction, and the retrieval move that fits its state (spec E9). Send a
 * staged file to the knowledge base; put a withdrawn one back; take one out
 * of retrieval, which asks first and needs an approved page citing it. The
 * column of mostly-empty action cells it replaces said the same "nothing to
 * do" on nearly every row.
 *
 * Renders nothing when the row has nothing to offer.
 */
export function DocumentRowMenu({
  fileId,
  fileName,
  retrieval,
  curated,
  failedExtraction,
}: {
  fileId: string;
  fileName: string;
  retrieval: BrainDocument['retrieval'];
  curated: boolean;
  /** The open "extraction failed" finding for this document, if any. */
  failedExtraction: string | null;
}) {
  const t = useTranslations('brain');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const retrieve = (
    action: typeof withdrawSourceDocumentAction,
    success: string,
  ) =>
    startTransition(async () => {
      const result = await action({ fileId });
      if (result.success) {
        toast.success(success);
        router.refresh();
        return;
      }
      toast.error(t(`documents.errors.${result.error}`));
    });

  const items: { key: string; label: string; run: () => void }[] = [];
  if (failedExtraction) {
    items.push({
      key: 'retry',
      label: t('documents.retry-extraction'),
      run: () =>
        startTransition(async () => {
          const result = await retryExtractionFindingAction({
            findingPublicId: failedExtraction,
          });
          if (result.success) {
            toast.success(t('extract.retry-started'));
            router.refresh();
            return;
          }
          toast.error(t(`extract.errors.${result.error}`));
        }),
    });
  }
  if (retrieval === 'staged') {
    items.push({
      key: 'send',
      label: t('documents.send'),
      run: () =>
        startTransition(async () => {
          const result = await sendStagedToKnowledgeBaseAction([fileId]);
          if (result.sent.length > 0) {
            toast.success(t('documents.sent'));
            router.refresh();
            return;
          }
          toast.error(t('documents.errors.failed-to-start'));
        }),
    });
  } else if (retrieval === 'withdrawn') {
    items.push({
      key: 'restore',
      label: t('documents.restore'),
      run: () => retrieve(restoreSourceDocumentAction, t('documents.restored')),
    });
  } else if (retrieval === 'in' && curated) {
    items.push({
      key: 'withdraw',
      label: t('documents.withdraw'),
      run: () => setConfirming(true),
    });
  }
  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative"
            disabled={pending}
            aria-label={t('documents.row-actions', { name: fileName })}
          >
            <TouchTarget>
              <EllipsisHorizontalIcon className="size-5" aria-hidden="true" />
            </TouchTarget>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map((item) => (
            <DropdownMenuItem key={item.key} onSelect={item.run}>
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('documents.withdraw-title')}
        description={t('documents.withdraw-description', { name: fileName })}
        confirmLabel={t('documents.withdraw')}
        onConfirm={() =>
          retrieve(withdrawSourceDocumentAction, t('documents.withdrawn'))
        }
      />
    </>
  );
}
