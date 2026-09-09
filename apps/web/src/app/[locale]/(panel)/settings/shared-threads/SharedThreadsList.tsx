'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { revokePublicLinkAction } from '@/app/actions/thread-public-links';
import type { PublicLinkDto } from '@/features/threads/contracts/thread.types';
import { useRouter } from '@/i18n/routing';

type Props = {
  initialLinks: PublicLinkDto[];
};

export function SharedThreadsList({ initialLinks }: Props) {
  const t = useTranslations('settings-page.shared-threads');
  const locale = useLocale();
  const router = useRouter();
  const [links, setLinks] = useState(initialLinks);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const buildUrl = (publicId: string) =>
    `${window.location.origin}/${locale}/public/thread/${publicId}`;

  const handleCopy = async (publicId: string) => {
    await navigator.clipboard.writeText(buildUrl(publicId));
    setCopiedId(publicId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevokeConfirmed = async () => {
    if (!confirmRevokeId) {
      return;
    }
    const result = await revokePublicLinkAction(confirmRevokeId);
    if (result.success) {
      setLinks((prev) => prev.filter((l) => l.threadId !== confirmRevokeId));
      router.refresh();
    }
    setConfirmRevokeId(null);
  };

  if (links.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <>
      <div className="space-y-2">
        {links.map((link) => (
          <div
            key={link.publicId}
            className="flex items-center justify-between rounded-lg border border-border p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {link.threadTitle ?? '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                {link.expiresAt
                  ? `${t('expires')}: ${new Date(link.expiresAt).toLocaleDateString()}`
                  : t('never')}
                {link.hasPassword && ` · ${t('has-password')}`}
              </p>
            </div>
            <div className="ml-4 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(link.publicId)}
              >
                {copiedId === link.publicId ? t('copied') : t('copy-link')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmRevokeId(link.threadId)}
              >
                {t('revoke')}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog
        open={confirmRevokeId !== null}
        onOpenChange={(open) => !open && setConfirmRevokeId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('revoke')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('revoke-confirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevokeConfirmed}>
              {t('revoke')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
