'use client';

import { useState, useEffect, useCallback } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { statusToast } from '@/app/lib/utils/toast';
import {
  getPublicLinkAction,
  createPublicLinkAction,
  revokePublicLinkAction,
} from '@/app/actions/thread-public-links';
import type { PublicLinkDto } from '@/features/threads/contracts/thread.types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  threadId: string;
};

type ExpirationOption = '24h' | '7d' | '30d' | 'never';

function getExpiresAt(option: ExpirationOption): Date | null {
  if (option === 'never') {
    return null;
  }
  const now = new Date();
  if (option === '24h') {
    now.setHours(now.getHours() + 24);
  } else if (option === '7d') {
    now.setDate(now.getDate() + 7);
  } else if (option === '30d') {
    now.setDate(now.getDate() + 30);
  }
  return now;
}

export function PublicShareDialog({ isOpen, onClose, threadId }: Props) {
  const t = useTranslations('thread-actions');
  const locale = useLocale();
  const { errorToast } = statusToast();
  const [existingLink, setExistingLink] = useState<
    PublicLinkDto | null | undefined
  >(undefined);
  const [expiration, setExpiration] = useState<ExpirationOption>('7d');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRevokeOpen, setConfirmRevokeOpen] = useState(false);

  const fetchLink = useCallback(async () => {
    try {
      const link = await getPublicLinkAction(threadId);
      setExistingLink(link);
    } catch {
      setExistingLink(null);
    }
  }, [threadId]);

  useEffect(() => {
    if (isOpen) {
      fetchLink();
    }
  }, [isOpen, fetchLink]);

  const buildUrl = (publicId: string) => {
    return `${window.location.origin}/${locale}/public/thread/${publicId}`;
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      const expiresAt = getExpiresAt(expiration);
      const result = await createPublicLinkAction(
        threadId,
        expiresAt,
        password || undefined,
      );
      if (result.success) {
        await fetchLink();
      } else {
        errorToast({ message: t('public-share-error') });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeConfirmed = async () => {
    setIsLoading(true);
    try {
      const result = await revokePublicLinkAction(threadId);
      if (result.success) {
        setExistingLink(null);
      } else {
        errorToast({ message: t('public-share-revoke-error') });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!existingLink) {
      return;
    }
    await navigator.clipboard.writeText(buildUrl(existingLink.publicId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isLoadingLink = existingLink === undefined;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('public-share-title')}</DialogTitle>
            <DialogDescription>
              {t('public-share-description')}
            </DialogDescription>
          </DialogHeader>

          {isLoadingLink && (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-zinc-400" />
            </div>
          )}

          {!isLoadingLink && existingLink && (
            <div className="space-y-3">
              <Input
                readOnly
                value={buildUrl(existingLink.publicId)}
                className="text-xs"
              />
              <div className="flex gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                <span>
                  {existingLink.expiresAt
                    ? t('public-share-expires-on', {
                        date: new Date(
                          existingLink.expiresAt,
                        ).toLocaleDateString(),
                      })
                    : t('public-share-never-expires')}
                </span>
                <span>·</span>
                <span>
                  {existingLink.hasPassword
                    ? t('public-share-has-password')
                    : t('public-share-no-password')}
                </span>
              </div>
            </div>
          )}

          {!isLoadingLink && !existingLink && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t('public-share-expires')}
                </label>
                <Select
                  value={expiration}
                  onValueChange={(v) => setExpiration(v as ExpirationOption)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">
                      {t('public-share-expires-24h')}
                    </SelectItem>
                    <SelectItem value="7d">
                      {t('public-share-expires-7d')}
                    </SelectItem>
                    <SelectItem value="30d">
                      {t('public-share-expires-30d')}
                    </SelectItem>
                    <SelectItem value="never">
                      {t('public-share-expires-never')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t('public-share-password')}
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('public-share-password-placeholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="size-4" />
                    ) : (
                      <EyeIcon className="size-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              {t('cancel')}
            </Button>
            {existingLink ? (
              <>
                <Button
                  variant="destructive"
                  onClick={() => setConfirmRevokeOpen(true)}
                  disabled={isLoading}
                >
                  {t('public-share-revoke')}
                </Button>
                <Button onClick={handleCopy} disabled={isLoading}>
                  {copied ? t('public-share-copied') : t('public-share-copy')}
                </Button>
              </>
            ) : (
              <Button
                onClick={handleGenerate}
                disabled={isLoading || isLoadingLink}
              >
                {t('public-share-generate')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRevokeOpen} onOpenChange={setConfirmRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('public-share-revoke')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('public-share-revoke-confirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevokeConfirmed}>
              {t('public-share-revoke')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
