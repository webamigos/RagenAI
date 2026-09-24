'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { sendStagedToKnowledgeBaseAction } from '@/app/actions/bulk-documents';
import { statusToast } from '@/app/lib/utils/toast';
import { useRouter } from '@/i18n/routing';

/**
 * Send a document staged into Ragen Brain to the knowledge base (spec F5):
 * it is then indexed like any upload. Shown only on a `STAGED` row, and only
 * to someone who manages the organization's documents.
 */
export function SendStagedButton({ fileId }: { fileId: string }) {
  const t = useTranslations('files-table');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className="whitespace-nowrap text-xs text-primary underline-offset-4 hover:underline disabled:opacity-50"
      onClick={(event) => {
        event.stopPropagation();
        startTransition(async () => {
          const result = await sendStagedToKnowledgeBaseAction([fileId]);
          if (result.sent.length > 0) {
            statusToast().successToast({ message: t('staged-sent') });
            router.refresh();
          } else {
            statusToast().errorToast({ message: t('staged-send-failed') });
          }
        });
      }}
    >
      {t('staged-send')}
    </button>
  );
}
