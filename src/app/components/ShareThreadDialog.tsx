'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { UserCircleIcon } from '@heroicons/react/24/outline';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { statusToast } from '@/app/lib/utils/toast';
import {
  shareThreadAction,
  getThreadSharesAction,
} from '@/features/threads/services/actions/thread-share-actions';
import type { ThreadShareRecipient } from '@/features/threads/contracts/thread.types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  threadId: string;
};

export function ShareThreadDialog({ isOpen, onClose, threadId }: Props) {
  const t = useTranslations('thread-actions');
  const { successToast, errorToast } = statusToast();
  const [members, setMembers] = useState<ThreadShareRecipient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const fetchShares = useCallback(async () => {
    setIsLoading(true);
    setFetchError(false);
    try {
      const result = await getThreadSharesAction(threadId);
      setMembers(result.sharedWith);
    } catch {
      setFetchError(true);
    } finally {
      setIsLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    if (isOpen) {
      fetchShares();
    }
  }, [isOpen, fetchShares]);

  const handleToggle = (userId: string, checked: boolean) => {
    setMembers((prev) =>
      prev.map((m) => (m.userId === userId ? { ...m, isShared: checked } : m)),
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const recipientUserIds = members
        .filter((m) => m.isShared)
        .map((m) => m.userId);
      const result = await shareThreadAction(threadId, recipientUserIds);

      if (result.success) {
        successToast({ message: t('share-success') });
        onClose();
      } else {
        errorToast({ message: result.error });
      }
    } catch {
      errorToast({ message: t('share-error') });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('share-title')}</DialogTitle>
          <DialogDescription>{t('share-description')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-64 overflow-y-auto">
          {(() => {
            if (isLoading) {
              return (
                <div className="flex justify-center py-6">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-zinc-400" />
                </div>
              );
            }
            if (fetchError) {
              return (
                <div className="flex flex-col items-center gap-2 py-4">
                  <p className="text-sm text-muted-foreground">
                    {t('share-load-error')}
                  </p>
                  <Button variant="outline" size="sm" onClick={fetchShares}>
                    {t('share-retry')}
                  </Button>
                </div>
              );
            }
            if (members.length === 0) {
              return (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {t('share-no-members')}
                </p>
              );
            }
            return (
              <div className="space-y-1">
                {members.map((member) => (
                  <label
                    key={member.userId}
                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50 cursor-pointer"
                  >
                    <div className="flex-shrink-0">
                      {member.image ? (
                        <img
                          src={member.image}
                          alt=""
                          className="size-8 rounded-full object-cover"
                        />
                      ) : (
                        <UserCircleIcon className="size-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {member.name || member.email}
                      </p>
                      {member.name && (
                        <p className="text-xs text-muted-foreground truncate">
                          {member.email}
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={member.isShared}
                      onCheckedChange={(checked) =>
                        handleToggle(member.userId, checked)
                      }
                      size="sm"
                    />
                  </label>
                ))}
              </div>
            );
          })()}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || isLoading || members.length === 0}
          >
            {t('share-save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
