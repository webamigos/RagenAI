'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';
import { InviteMemberDialog } from './InviteMemberDialog';
import { MemberActionsDropdown } from './MemberActionsDropdown';
import { statusToast } from '@/app/lib/utils/toast';
import { removeMember, updateMemberRole } from '../actions/members';
import type { Member } from '../types';

type Props = {
  members: Member[];
  organizationId: string;
  currentUserRole: string;
  currentUserEmail: string;
  allowInvite: boolean; // feature flag check
};

export function MembersList({
  members,
  organizationId,
  currentUserRole,
  currentUserEmail,
  allowInvite,
}: Props) {
  const t = useTranslations('organization.members');
  const { successToast, errorToast } = statusToast();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  const canManageMembers = ['admin', 'owner'].includes(currentUserRole);

  const handleRemoveMember = async (memberEmail: string) => {
    if (!confirm(t('confirm-remove'))) {
      return;
    }

    const result = await removeMember(memberEmail, organizationId);
    if (result.success) {
      successToast({ message: t('remove-success') });
    } else {
      errorToast({ message: result.error || t('remove-error') });
    }
  };

  const handleChangeRole = async (
    memberId: string,
    newRole: 'admin' | 'member',
  ) => {
    const result = await updateMemberRole(memberId, newRole, organizationId);
    if (result.success) {
      successToast({ message: t('role-update-success') });
    } else {
      errorToast({ message: result.error || t('role-update-error') });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('title')} ({members.length})
        </h2>
        {canManageMembers && allowInvite && (
          <Button onClick={() => setIsInviteDialogOpen(true)}>
            {t('invite-member')}
          </Button>
        )}
      </div>

      {/* Feature flag info */}
      {canManageMembers && !allowInvite && (
        <div className="rounded-md bg-yellow-50 p-4 dark:bg-yellow-900/20">
          <p className="text-sm text-yellow-700 dark:text-yellow-200">
            {t('invite-unavailable-plan')}
          </p>
        </div>
      )}

      {/* Members table */}
      {members.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">{t('no-members')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  {t('user')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  {t('role')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  {t('joined')}
                </th>
                {canManageMembers && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                    {t('actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
              {members.map((member) => {
                const isCurrentUser = member.user.email === currentUserEmail;
                const canModifyMember =
                  canManageMembers && !isCurrentUser && member.role !== 'owner';

                return (
                  <tr key={member.id}>
                    {/* User */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {member.user.image ? (
                          <img
                            src={member.user.image}
                            alt={member.user.name || member.user.email}
                            className="h-10 w-10 rounded-full mr-3"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-indigo-500 flex items-center justify-center mr-3">
                            <span className="text-white font-medium text-sm">
                              {(member.user.name ||
                                member.user.email)[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {member.user.name || member.user.email}
                            {isCurrentUser && (
                              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                ({t('you')})
                              </span>
                            )}
                          </div>
                          {member.user.name && (
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {member.user.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          member.role === 'owner'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                            : member.role === 'admin'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {t(`role-${member.role}`)}
                      </span>
                    </td>

                    {/* Joined date */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {new Date(member.createdAt).toLocaleDateString('pl-PL', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </td>

                    {/* Actions */}
                    {canManageMembers && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {canModifyMember ? (
                          <MemberActionsDropdown
                            member={member}
                            onRemove={() =>
                              handleRemoveMember(member.user.email)
                            }
                            onChangeRole={handleChangeRole}
                            disabled={false}
                          />
                        ) : (
                          <span className="text-gray-400 dark:text-gray-600">
                            —
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite dialog */}
      <InviteMemberDialog
        isOpen={isInviteDialogOpen}
        onClose={() => setIsInviteDialogOpen(false)}
        organizationId={organizationId}
      />
    </div>
  );
}
