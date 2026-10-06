'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { UserFileType } from '@/features/documents/contracts/document.types';
import {
  optimizationEligible,
  requestDocumentOptimizations,
} from '@/features/documents/utils/knowledge-list-issues';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { logger } from '@/app/lib/utils/logger';
import { Link } from '@/i18n/routing';

export function OptimizeFilesDialog({
  files,
  onClose,
}: {
  files: UserFileType[];
  onClose: () => void;
}) {
  const t = useTranslations('knowledge-list');
  const eligible = files.filter(optimizationEligible);
  const [pending, setPending] = useState(false);
  const [results, setResults] = useState<{ id: string; ok: boolean }[] | null>(
    null,
  );
  async function run() {
    setPending(true);
    try {
      const ids = results
        ? results.filter((result) => !result.ok).map((result) => result.id)
        : eligible.map((file) => file.document!.id);
      const next = await requestDocumentOptimizations(ids);
      const failed = next.filter((result) => !result.ok);
      if (failed.length) {
        logger.warn(
          { failed: failed.length },
          'Document optimization requests failed',
        );
      }
      setResults((previous) => [
        ...(previous?.filter((result) => result.ok) ?? []),
        ...next,
      ]);
    } finally {
      setPending(false);
    }
  }
  const failed = results?.filter((result) => !result.ok).length ?? 0;
  let actionLabel = t('optimization-start');
  if (pending) {
    actionLabel = t('optimization-starting');
  } else if (results) {
    actionLabel = t('optimization-retry');
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('optimize-rag')}</DialogTitle>
          <DialogDescription>{t('optimization-description')}</DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          {t('optimization-eligible', { count: eligible.length })}
        </p>
        {files.length > eligible.length && (
          <p className="text-sm text-muted-foreground">
            {t('optimization-skipped', {
              count: files.length - eligible.length,
            })}
          </p>
        )}
        <ul className="max-h-60 overflow-y-auto space-y-2 text-sm">
          {files.map((file) => (
            <li key={file.id} className="break-words">
              {file.fileName}
              {results?.some(
                (result) => result.id === file.document?.id && result.ok,
              ) &&
                file.document && (
                  <Link
                    href={`/knowledge/documents/${file.document.id}?tab=optimize`}
                    className="ml-2 text-primary underline"
                  >
                    {t('review-suggestions')}
                  </Link>
                )}
            </li>
          ))}
        </ul>
        {results && (
          <p role="status" className="text-sm">
            {t('optimization-result', {
              success: results.filter((result) => result.ok).length,
              failed,
            })}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('close')}
          </Button>
          {(!results || failed > 0) && (
            <Button onClick={run} disabled={pending || eligible.length === 0}>
              {actionLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
