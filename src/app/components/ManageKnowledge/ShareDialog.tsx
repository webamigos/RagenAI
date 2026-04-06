'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogTitle } from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { statusToast } from '@/app/lib/utils/toast';
import {
  shareFile,
  shareFolder,
  revokeShare,
  getFilePermissions,
  getFolderPermissions,
} from '@/app/actions/permissions';
import type {
  DocumentPermissionItem,
  PermissionLevel,
} from '@/features/documents/contracts/permission.types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  resourceType: 'file' | 'folder';
  resourceId: string; // file id or folder id
  resourceName: string;
  orgMembers: { id: string; name: string | null; email: string }[];
  orgTeams: { id: string; name: string }[];
  ownerName?: string;
};

export function ShareDialog({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
  orgMembers,
  orgTeams,
  ownerName,
}: Props) {
  const { successToast, errorToast } = statusToast();
  const [permissions, setPermissions] = useState<DocumentPermissionItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPermission, setSelectedPermission] =
    useState<PermissionLevel>('full');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadPermissions = useCallback(async () => {
    if (resourceType === 'file') {
      const perms = await getFilePermissions(resourceId as string);
      setPermissions(perms);
    } else {
      const perms = await getFolderPermissions(resourceId);
      setPermissions(perms);
    }
  }, [resourceType, resourceId]);

  useEffect(() => {
    if (isOpen) {
      loadPermissions();
      setSearchQuery('');
    }
  }, [isOpen, loadPermissions]);

  const filteredMembers = orgMembers.filter(
    (m) =>
      searchQuery &&
      (m.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const filteredTeams = orgTeams.filter(
    (t) =>
      searchQuery && t.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleShare = async (
    granteeType: 'user' | 'team',
    granteeId: string,
  ) => {
    setIsSubmitting(true);
    try {
      const result =
        resourceType === 'file'
          ? await shareFile(
              resourceId,
              granteeType,
              granteeId,
              selectedPermission,
            )
          : await shareFolder(
              resourceId,
              granteeType,
              granteeId,
              selectedPermission,
            );

      if (result.success) {
        successToast({ message: 'Shared successfully' });
        loadPermissions();
        setSearchQuery('');
      } else {
        errorToast({
          message: result.error || 'Failed to share',
        });
      }
    } catch {
      errorToast({ message: 'Failed to share' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (permissionId: string) => {
    try {
      const result = await revokeShare(parseInt(permissionId, 10));
      if (result.success) {
        successToast({ message: 'Access revoked' });
        loadPermissions();
      } else {
        errorToast({ message: result.error || 'Failed to revoke' });
      }
    } catch {
      errorToast({ message: 'Failed to revoke access' });
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}`;
    navigator.clipboard.writeText(url);
    successToast({ message: 'Link copied' });
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="md">
      <DialogTitle>Share &quot;{resourceName}&quot;</DialogTitle>

      <div className="mt-4 space-y-4">
        {/* Search & invite */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Enter name or email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            value={selectedPermission}
            onChange={(e) =>
              setSelectedPermission(e.target.value as PermissionLevel)
            }
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="full">Full access</option>
            <option value="view">View only</option>
          </select>
        </div>

        {/* Search results */}
        {(filteredMembers.length > 0 || filteredTeams.length > 0) && (
          <div className="max-h-40 overflow-y-auto border rounded-md dark:border-gray-700">
            {filteredTeams.map((team) => (
              <button
                key={`team-${team.id}`}
                type="button"
                disabled={isSubmitting}
                onClick={() => handleShare('team', team.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <span className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-xs font-medium text-blue-700 dark:text-blue-300">
                  T
                </span>
                <div className="text-left">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {team.name}
                  </div>
                  <div className="text-xs text-gray-500">Team</div>
                </div>
              </button>
            ))}
            {filteredMembers.map((member) => (
              <button
                key={`user-${member.id}`}
                type="button"
                disabled={isSubmitting}
                onClick={() => handleShare('user', member.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <span className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300">
                  {(member.name || member.email).charAt(0).toUpperCase()}
                </span>
                <div className="text-left">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {member.name || member.email}
                  </div>
                  <div className="text-xs text-gray-500">{member.email}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Who has access */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Who has access
          </h4>
          <div className="space-y-2">
            {ownerName && (
              <div className="flex items-center justify-between px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-xs font-medium text-green-700 dark:text-green-300">
                    {ownerName.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {ownerName}
                    </div>
                    <div className="text-xs text-gray-500">Owner</div>
                  </div>
                </div>
                <span className="text-xs text-gray-400">Full access</span>
              </div>
            )}

            {permissions.map((perm) => (
              <div
                key={perm.id}
                className="flex items-center justify-between px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-800"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                      perm.granteeType === 'team'
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {perm.granteeType === 'team'
                      ? 'T'
                      : perm.granteeName.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {perm.granteeName}
                    </div>
                    {perm.granteeEmail && (
                      <div className="text-xs text-gray-500">
                        {perm.granteeEmail}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {perm.permission === 'full' ? 'Full access' : 'View only'}
                  </span>
                  <button
                    onClick={() => handleRevoke(perm.id)}
                    className="text-red-500 hover:text-red-600 text-xs"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Copy link */}
        <div className="flex justify-between items-center pt-4 border-t dark:border-gray-700">
          <button
            type="button"
            onClick={handleCopyLink}
            className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            Copy link
          </button>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
