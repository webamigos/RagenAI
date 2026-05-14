'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogTitle } from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { statusToast } from '@/app/lib/utils/toast';
import {
  shareProject,
  revokeProjectShare,
  getProjectPermissions,
} from '@/app/actions/project-permissions';
import { getOrgMembersAndTeams } from '@/app/actions/permissions';
import type {
  ProjectPermissionItem,
  ProjectPermissionLevel,
} from '@/features/projects/contracts/project-permission.types';

type OrgMember = { id: string; name: string | null; email: string };
type OrgTeam = { id: string; name: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectTitle: string;
  ownerName?: string;
};

export function ShareAccessDialog({
  isOpen,
  onClose,
  projectId,
  projectTitle,
  ownerName,
}: Props) {
  const t = useTranslations('share-access-dialog');
  const { successToast, errorToast } = statusToast();
  const [permissions, setPermissions] = useState<ProjectPermissionItem[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [orgTeams, setOrgTeams] = useState<OrgTeam[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPermission, setSelectedPermission] =
    useState<ProjectPermissionLevel>('view');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadPermissions = useCallback(async () => {
    const perms = await getProjectPermissions(projectId);
    setPermissions(perms);
  }, [projectId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    loadPermissions();
    getOrgMembersAndTeams()
      .then(({ members, teams }) => {
        setOrgMembers(members);
        setOrgTeams(teams);
      })
      .catch(() => {
        setOrgMembers([]);
        setOrgTeams([]);
      });
    setSearchQuery('');
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
      const result = await shareProject(
        projectId,
        granteeType,
        granteeId,
        selectedPermission,
      );
      if (result.success) {
        successToast({ message: t('shared-success') });
        await loadPermissions();
        setSearchQuery('');
      } else {
        errorToast({ message: result.error || t('share-failed') });
      }
    } catch {
      errorToast({ message: t('share-failed') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (permissionId: string) => {
    try {
      const result = await revokeProjectShare(parseInt(permissionId, 10));
      if (result.success) {
        successToast({ message: t('revoke-success') });
        await loadPermissions();
      } else {
        errorToast({ message: result.error || t('revoke-failed') });
      }
    } catch {
      errorToast({ message: t('revoke-failed') });
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="md">
      <DialogTitle>{t('title', { title: projectTitle })}</DialogTitle>

      <div className="mt-4 space-y-4">
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              type="text"
              placeholder={t('search-placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            value={selectedPermission}
            onChange={(e) =>
              setSelectedPermission(e.target.value as ProjectPermissionLevel)
            }
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="view">{t('permission-view')}</option>
            <option value="full">{t('permission-full')}</option>
          </select>
        </div>

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
                  <div className="text-xs text-gray-500">{t('team-badge')}</div>
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

        <div>
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('who-has-access')}
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
                    <div className="text-xs text-gray-500">{t('owner')}</div>
                  </div>
                </div>
                <span className="text-xs text-gray-400">
                  {t('permission-full')}
                </span>
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
                    {perm.permission === 'full'
                      ? t('permission-full')
                      : t('permission-view')}
                  </span>
                  <button
                    onClick={() => handleRevoke(perm.id)}
                    className="text-red-500 hover:text-red-600 text-xs"
                  >
                    {t('remove')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t dark:border-gray-700">
          <Button type="button" onClick={onClose}>
            {t('done')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
