'use client';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { dismissOrphanFindingAction } from '../actions';
import { useReviewAction } from './useReviewAction';

export function DismissOrphanButton({ publicId }: { publicId: string }) {
  const t = useTranslations('brain.findings');
  const { pending, run } = useReviewAction();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        run(
          () => dismissOrphanFindingAction({ findingPublicId: publicId }),
          t('dismissed'),
        )
      }
    >
      {t('dismiss-orphan')}
    </Button>
  );
}
