'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

import type {
  ReviewError,
  ReviewResult,
} from '@/features/brain/contracts/brain-review.types';
import { useRouter } from '@/i18n/routing';

/**
 * Run one review action and tell the reviewer what happened (spec D2).
 *
 * On success the route is refreshed rather than patched locally: the page's
 * `updatedAt` moves with every decision, and the next action has to carry the
 * new one or it is refused as a conflict. A conflict refreshes too, so the
 * reviewer is looking at what they are now deciding about.
 *
 * `onError` may claim an error — the access editor claims
 * `confirm-widening` to open its dialog — by returning true. `onSuccess`
 * runs after a success, changed or not, for a form to close itself.
 */
export function useReviewAction() {
  const t = useTranslations('brain.review');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<ReviewResult>,
    success: string,
    handlers: {
      onError?: (error: ReviewError) => boolean;
      onSuccess?: () => void;
    } = {},
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        toast.success(result.changed ? success : t('unchanged'));
        handlers.onSuccess?.();
        router.refresh();
        return;
      }
      if (handlers.onError?.(result.error)) {
        return;
      }
      toast.error(t(`errors.${result.error}`));
      if (result.error === 'conflict') {
        router.refresh();
      }
    });
  }

  return { pending, run };
}
