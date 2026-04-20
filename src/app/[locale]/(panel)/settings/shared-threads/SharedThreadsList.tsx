'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { revokePublicLinkAction } from '@/app/actions/thread-public-links';
import type { PublicLinkDto } from '@/features/threads/contracts/thread.types';
import { useRouter } from '@/i18n/routing';

type Props = {
  initialLinks: PublicLinkDto[];
};

export function SharedThreadsList({ initialLinks }: Props) {
  const t = useTranslations('settings-page.shared-threads');
  const router = useRouter();
  const [links, setLinks] = useState(initialLinks);

  const buildUrl = (publicId: string) =>
    `${window.location.origin}/pl/public/thread/${publicId}`;

  const handleCopy = async (publicId: string) => {
    await navigator.clipboard.writeText(buildUrl(publicId));
  };

  const handleRevoke = async (threadId: string) => {
    if (!confirm(t('revoke-confirm'))) {
      return;
    }
    const result = await revokePublicLinkAction(threadId);
    if (result.success) {
      setLinks((prev) => prev.filter((l) => l.threadId !== threadId));
      router.refresh();
    }
  };

  if (links.length === 0) {
    return (
      <p className="py-4 text-sm text-zinc-500 dark:text-zinc-400">
        {t('empty')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {links.map((link) => (
        <div
          key={link.publicId}
          className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
              {link.threadTitle ?? '—'}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
              {t('copy-link')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleRevoke(link.threadId)}
            >
              {t('revoke')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
