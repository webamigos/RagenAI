'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogTitle } from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { statusToast } from '@/app/lib/utils/toast';
import { createFolder } from '@/app/actions/folders';
import { PiiPolicySelect, type PiiPolicyValue } from '../PiiPolicySelect';
import { useOrganization } from '@/app/hooks/use-auth';

type TeamOption = {
  id: string;
  name: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  teams: TeamOption[];
  onCreated: () => void;
  parentId?: string | null;
  parentName?: string;
};

export function CreateFolderDialog({
  isOpen,
  onClose,
  teams,
  onCreated,
  parentId,
  parentName,
}: Props) {
  const { successToast, errorToast } = statusToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [piiPolicy, setPiiPolicy] = useState<PiiPolicyValue>('TOXIC_ONLY');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { canManageOrg } = useOrganization();

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await createFolder(
        name.trim(),
        teamId || null,
        parentId ?? null,
        piiPolicy as any,
      );
      successToast({ message: 'Folder created' });
      setName('');
      setTeamId('');
      setPiiPolicy('TOXIC_ONLY');
      onClose();
      onCreated();
    } catch {
      errorToast({ message: 'Failed to create folder' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setName('');
    setTeamId('');
    setPiiPolicy('TOXIC_ONLY');
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} size="md">
      <DialogTitle>
        {parentName ? `Create Subfolder in "${parentName}"` : 'Create Folder'}
      </DialogTitle>

      <form onSubmit={handleSubmit} className="space-y-6 mt-6">
        <div>
          <label
            htmlFor="folder-name"
            className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
          >
            Folder Name
          </label>
          <Input
            id="folder-name"
            type="text"
            placeholder="e.g. HR Documents, Product Specs"
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label
            htmlFor="folder-team"
            className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
          >
            Restrict to Team (optional)
          </label>
          <select
            id="folder-team"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            disabled={isSubmitting}
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 focus:border-indigo-600 focus:ring-indigo-600"
          >
            <option value="">Organization-wide (visible to all)</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Team-restricted folders are only visible to team members.
          </p>
        </div>

        <div>
          <label
            htmlFor="folder-pii-policy"
            className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
          >
            PII Masking Policy
          </label>
          <PiiPolicySelect
            id="folder-pii-policy"
            value={piiPolicy}
            onChange={setPiiPolicy}
            disabled={isSubmitting}
            showInfoLink={canManageOrg}
          />
        </div>

        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Cancel
          </Button>
          <Button isSubmit={true} disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? 'Creating...' : 'Create Folder'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
