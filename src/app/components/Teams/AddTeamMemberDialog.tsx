'use client';

import { useEffect, useState } from 'react';
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
      successToast({ message: 'Member added to team' });
      setSelectedUserId('');
      onClose();
      onAdded();
    } catch {
      errorToast({ message: 'Failed to add member' });
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
      <DialogTitle>Add Team Member</DialogTitle>

      <form onSubmit={handleSubmit} className="space-y-6 mt-6">
        {availableMembers.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            All organization members are already in this team.
          </p>
        ) : (
          <div>
            <label
              htmlFor="member-select"
              className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
            >
              Select Member
            </label>
            <select
              id="member-select"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 focus:border-indigo-500 focus:ring-indigo-500"
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
            className="bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Cancel
          </Button>
          {availableMembers.length > 0 && (
            <Button isSubmit={true} disabled={isSubmitting || !selectedUserId}>
              {isSubmitting ? 'Adding...' : 'Add Member'}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
