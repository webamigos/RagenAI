'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MergeTarget } from '@/features/brain/contracts/brain-review.types';
import { useRouter } from '@/i18n/routing';

import { mergeKnowledgePagesAction } from '../actions';
import { useReviewAction } from './useReviewAction';

/**
 * Merge this candidate into another page (spec D2b). Pages that look like the
 * same subject are offered first, under their own heading. Confirmation says
 * what the merge does to both pages; on success the reviewer lands on the
 * page that stayed, which is where the next decision is.
 */
export function MergePicker({
  publicId,
  updatedAt,
  targets,
}: {
  publicId: string;
  updatedAt: string;
  targets: MergeTarget[];
}) {
  const t = useTranslations('brain.review');
  const router = useRouter();
  const { pending, run } = useReviewAction();
  const [chosen, setChosen] = useState('');
  const [confirming, setConfirming] = useState(false);

  if (targets.length === 0) {
    return <p className="text-muted-foreground">{t('merge-none')}</p>;
  }
  const suggested = targets.filter((p) => p.suggested);
  const others = targets.filter((p) => !p.suggested);
  const target = targets.find((p) => p.publicId === chosen);

  return (
    <div className="space-y-2">
      <Select value={chosen} onValueChange={setChosen} disabled={pending}>
        <SelectTrigger
          size="sm"
          className="w-full"
          aria-label={t('merge-label')}
        >
          <SelectValue placeholder={t('merge-placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {suggested.length > 0 && (
            <SelectGroup>
              <SelectLabel>{t('merge-suggested')}</SelectLabel>
              {suggested.map((p) => (
                <SelectItem key={p.publicId} value={p.publicId}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {others.length > 0 && (
            <SelectGroup>
              <SelectLabel>{t('merge-others')}</SelectLabel>
              {others.map((p) => (
                <SelectItem key={p.publicId} value={p.publicId}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
      {target && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          {t('merge-submit')}
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('merge-confirm-title')}
        description={t('merge-confirm-description', {
          target: target?.title ?? '',
        })}
        confirmLabel={t('merge-submit')}
        onConfirm={() =>
          run(
            () =>
              mergeKnowledgePagesAction({
                publicId,
                expectedUpdatedAt: updatedAt,
                targetPublicId: chosen,
              }),
            t('merged'),
            { onSuccess: () => router.push(`/brain/pages/${chosen}`) },
          )
        }
      />
    </div>
  );
}
