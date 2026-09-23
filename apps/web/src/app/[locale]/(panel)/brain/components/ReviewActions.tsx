'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { Button } from '@/components/ui/button';

import {
  approveKnowledgePageAction,
  rejectKnowledgePageAction,
} from '../actions';
import { useReviewAction } from './useReviewAction';

/**
 * Approve or reject a candidate page (spec D2).
 *
 * Approve is disabled until the page has an owner, with the reason next to
 * it rather than in a tooltip: the server refuses it anyway
 * (`owner-required`), and a button that fails when pressed teaches less than
 * one that says what it needs. Reject asks first — it is a decision the panel
 * offers no way back from.
 */
export function ReviewActions({
  publicId,
  updatedAt,
  hasOwner,
}: {
  publicId: string;
  updatedAt: string;
  hasOwner: boolean;
}) {
  const t = useTranslations('brain.review');
  const { pending, run } = useReviewAction();
  const [confirmReject, setConfirmReject] = useState(false);
  const ref = { publicId, expectedUpdatedAt: updatedAt };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        disabled={pending || !hasOwner}
        onClick={() =>
          run(() => approveKnowledgePageAction(ref), t('approved'))
        }
      >
        {t('approve')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
        disabled={pending}
        onClick={() => setConfirmReject(true)}
      >
        {t('reject')}
      </Button>
      {!hasOwner && (
        <p className="w-full text-xs text-muted-foreground">
          {t('approve-needs-owner')}
        </p>
      )}
      <ConfirmDialog
        open={confirmReject}
        onOpenChange={setConfirmReject}
        title={t('reject-confirm-title')}
        description={t('reject-confirm-description')}
        confirmLabel={t('reject')}
        destructive
        onConfirm={() =>
          run(() => rejectKnowledgePageAction(ref), t('rejected'))
        }
      />
    </div>
  );
}
