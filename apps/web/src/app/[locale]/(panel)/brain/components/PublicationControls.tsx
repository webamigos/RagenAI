'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import type { KnowledgePageDetail } from '@/features/brain/contracts/brain.types';

import {
  publishKnowledgePageAction,
  unpublishKnowledgePageAction,
} from '../actions';
import { useReviewAction } from './useReviewAction';

/**
 * Put an approved page into the knowledge base, or take it out (spec E2/E3).
 *
 * The state is said in words — never published, being written, serving,
 * withdrawn — because "published" is two facts (the row and the chunks) and a
 * reviewer who sees only one of them is looking at half the truth. What would
 * block a publication is said before the button is pressed; the server
 * refuses the same cases anyway.
 */
export function PublicationControls({
  publicId,
  updatedAt,
  state,
  outdated,
  blockers,
}: {
  publicId: string;
  updatedAt: string;
  state: KnowledgePageDetail['publication'];
  outdated: boolean;
  /** Reasons publishing is not possible yet, already translated. */
  blockers: string[];
}) {
  const t = useTranslations('brain.publication');
  const { pending, run } = useReviewAction();
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const ref = { publicId, expectedUpdatedAt: updatedAt };
  const live =
    state === 'published' || state === 'publishing' || state === 'failed';

  return (
    <div className="space-y-2" data-testid="brain-publication">
      <p className="text-foreground">{t(`state.${state}`)}</p>
      {outdated && (
        <p className="text-xs text-muted-foreground">{t('outdated')}</p>
      )}
      {blockers.length > 0 && !live && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {(!live ||
          outdated ||
          state === 'publishing' ||
          state === 'failed') && (
          <Button
            size="sm"
            disabled={pending || (blockers.length > 0 && !live)}
            onClick={() =>
              run(() => publishKnowledgePageAction(ref), t('published'))
            }
          >
            {live ? t('republish') : t('publish')}
          </Button>
        )}
        {live && (
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            disabled={pending}
            onClick={() => setConfirmWithdraw(true)}
          >
            {t('withdraw')}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmWithdraw}
        onOpenChange={setConfirmWithdraw}
        title={t('withdraw-title')}
        description={t('withdraw-description')}
        confirmLabel={t('withdraw')}
        destructive
        onConfirm={() =>
          run(() => unpublishKnowledgePageAction(ref), t('withdrawn'))
        }
      />
    </div>
  );
}
