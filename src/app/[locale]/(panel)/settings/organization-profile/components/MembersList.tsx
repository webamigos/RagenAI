'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';
import { InviteMemberDialog } from './InviteMemberDialog';
import { MemberActionsDropdown } from './MemberActionsDropdown';
import { statusToast } from '@/app/lib/utils/toast';
import { removeMember, updateMemberRole } from '../actions/members';
import { isOrgAdmin } from '@/lib/auth-access-control';
import type { Member } from '../types';

type Props = {
  members: Member[];
  organizationId: string;
  currentUserRole: string;
  currentUserEmail: string;
  allowInvite: boolean;
};

export function MembersList({
  members,
  organizationId,
  currentUserRole,
  currentUserEmail,
  allowInvite,
}: Props) {
  const t = useTranslations('organization.members');
  const locale = useLocale();
  const { successToast, errorToast } = statusToast();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  const canManageMembers = isOrgAdmin(currentUserRole);

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
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
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
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {t('invite-unavailable-plan')}
          </p>
        </div>
      )}

      {/* Members list */}
      {members.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('no-members')}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {members.map((member) => {
            const isCurrentUser = member.user.email === currentUserEmail;
            const canModifyMember =
              canManageMembers && !isCurrentUser && member.role !== 'owner';

            return (
              <div key={member.id} className="flex items-center gap-3 py-3">
                {/* Avatar */}
                {member.user.image ? (
                  <img
                    src={member.user.image}
                    alt={member.user.name || member.user.email}
                    className="h-9 w-9 shrink-0 rounded-full"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700">
                    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                      {(member.user.name || member.user.email)[0].toUpperCase()}
                    </span>
                  </div>
                )}

                {/* User info */}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-950 dark:text-white">
                    {member.user.name || member.user.email}
                    {isCurrentUser && (
                      <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                        ({t('you')})
                      </span>
                    )}
                  </div>
                  {member.user.name && (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {member.user.email}
                    </div>
                  )}
                </div>

                {/* Role badge */}
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                    member.role === 'owner'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : member.role === 'admin'
                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {t(`role-${member.role}`)}
                </span>

                {/* Joined date */}
                <span className="hidden shrink-0 text-xs text-zinc-400 sm:block dark:text-zinc-500">
                  {new Date(member.createdAt).toLocaleDateString(locale, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>

                {/* Actions */}
                {canManageMembers && (
                  <div className="shrink-0">
                    {canModifyMember ? (
                      <MemberActionsDropdown
                        member={member}
                        onRemove={() => handleRemoveMember(member.user.email)}
                        onChangeRole={handleChangeRole}
                        disabled={false}
                      />
                    ) : (
                      <div className="w-8" />
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
