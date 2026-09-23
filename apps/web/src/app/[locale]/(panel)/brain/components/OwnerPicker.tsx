'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ReviewOptions } from '@/features/brain/contracts/brain-review.types';

import { setKnowledgePageOwnerAction } from '../actions';
import { useReviewAction } from './useReviewAction';

/**
 * Name the page's owner (spec D2) — the person who vouches for it. A choice
 * and a separate save, not a save on change: every save is a row in the
 * ledger, and a mis-click on a select should not be one.
 */
export function OwnerPicker({
  publicId,
  updatedAt,
  ownerId,
  members,
}: {
  publicId: string;
  updatedAt: string;
  ownerId: string | null;
  members: ReviewOptions['members'];
}) {
  const t = useTranslations('brain.review');
  const { pending, run } = useReviewAction();
  const [chosen, setChosen] = useState(ownerId ?? '');

  return (
    <div className="space-y-2">
      <Select value={chosen} onValueChange={setChosen} disabled={pending}>
        <SelectTrigger
          size="sm"
          className="w-full"
          aria-label={t('owner-label')}
        >
          <SelectValue placeholder={t('owner-placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {members.map((m) => (
            <SelectItem key={m.userId} value={m.userId}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {chosen !== '' && chosen !== ownerId && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                setKnowledgePageOwnerAction({
                  publicId,
                  expectedUpdatedAt: updatedAt,
                  ownerId: chosen,
                }),
              t('owner-saved'),
            )
          }
        >
          {t('owner-save')}
        </Button>
      )}
    </div>
  );
}
