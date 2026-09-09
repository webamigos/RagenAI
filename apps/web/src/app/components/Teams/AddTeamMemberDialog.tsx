'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogTitle } from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import { statusToast } from '@/app/lib/utils/toast';
import { authClient } from '@/app/hooks/use-better-auth';

type OrgMember = {
  id: string;
  userId: string;
  name?: string;
  email: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  existingMemberIds: string[];
  orgMembers: OrgMember[];
  onAdded: () => void;
};

export function AddTeamMemberDialog({
  isOpen,
  onClose,
  teamId,
  existingMemberIds,
  orgMembers,
  onAdded,
}: Props) {
  const t = useTranslations('teams-page');
  const { successToast, errorToast } = statusToast();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableMembers = orgMembers.filter(
    (m) => !existingMemberIds.includes(m.userId),
  );

  useEffect(() => {
    if (isOpen && !selectedUserId) {
      const firstAvailable = orgMembers.find(
        (m) => !existingMemberIds.includes(m.userId),
      );
      if (firstAvailable) {
        setSelectedUserId(firstAvailable.userId);
      }
    }
  }, [isOpen, orgMembers, existingMemberIds, selectedUserId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      return;
    }

    setIsSubmitting(true);
    try {
      await authClient.organization.addTeamMember({
        teamId,
        userId: selectedUserId,
      });
      successToast({ message: t('member-added') });
      setSelectedUserId('');
      onClose();
      onAdded();
    } catch {
      errorToast({ message: t('member-add-error') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedUserId('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} size="md">
      <DialogTitle>{t('add-member')}</DialogTitle>

      <form onSubmit={handleSubmit} className="space-y-6 mt-6">
        {availableMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('all-members-added')}
          </p>
        ) : (
          <div>
            <label
              htmlFor="member-select"
              className="block text-sm font-medium mb-2 text-foreground"
            >
              {t('select-member')}
            </label>
            <select
              id="member-select"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground dark:bg-muted focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            >
              {availableMembers.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name || member.email} ({member.email})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            plain
          >
            {t('cancel')}
          </Button>
          {availableMembers.length > 0 && (
            <Button isSubmit={true} disabled={isSubmitting || !selectedUserId}>
              {isSubmitting ? t('adding') : t('add-member')}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
