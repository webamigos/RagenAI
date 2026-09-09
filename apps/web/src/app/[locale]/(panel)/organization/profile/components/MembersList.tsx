'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';
import { InviteMemberDialog } from './InviteMemberDialog';
import { MemberActionsDropdown } from './MemberActionsDropdown';
import { statusToast } from '@/app/lib/utils/toast';
import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { removeMember, updateMemberRole } from '../actions/members';
import {
  ORG_ADMIN_ROLE,
  canManageOrg,
  canOwnOrg,
} from '@/lib/auth-access-control';
import type { Member } from '../types';

type Props = {
  members: Member[];
  organizationId: string;
  currentUserRole: string;
  currentUserEmail: string;
  allowInvite: boolean;
  /**
   * The viewer is the shared demo account. Inviting is off there because the
   * tenant's `inviteMembers` override says so, not because of the plan — so
   * the notice says "demo", not "upgrade": there is no plan to change to.
   */
  demoAccount?: boolean;
};

export function MembersList({
  members,
  organizationId,
  currentUserRole,
  currentUserEmail,
  allowInvite,
  demoAccount = false,
}: Props) {
  const t = useTranslations('organization.members');
  const locale = useLocale();
  const { successToast, errorToast } = statusToast();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  const canManageMembers = canManageOrg(currentUserRole);

  // Held rather than asked inline: a dialog cannot block the way `confirm()`
  // did, so the address waits here until the answer comes back.
  const [memberPendingRemoval, setMemberPendingRemoval] = useState<
    string | null
  >(null);

  const handleRemoveMember = async (memberEmail: string) => {
    setMemberPendingRemoval(null);

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
        <h2 className="text-base font-semibold text-foreground">
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
        <div className="rounded-lg border border-pending/40 bg-pending-tint p-3 dark:bg-pending/30">
          <p className="text-sm text-pending">
            {t(
              demoAccount
                ? 'invite-unavailable-demo'
                : 'invite-unavailable-plan',
            )}
          </p>
        </div>
      )}

      {/* Members list */}
      {members.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">{t('no-members')}</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {members.map((member) => {
            const isCurrentUser = member.user.email === currentUserEmail;
            const canModifyMember =
              canManageMembers && !isCurrentUser && !canOwnOrg(member.role);

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
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-200 dark:bg-paper-700">
                    <span className="text-sm font-medium text-muted-foreground">
                      {(member.user.name || member.user.email)[0].toUpperCase()}
                    </span>
                  </div>
                )}

                {/* User info */}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {member.user.name || member.user.email}
                    {isCurrentUser && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({t('you')})
                      </span>
                    )}
                  </div>
                  {member.user.name && (
                    <div className="text-xs text-muted-foreground">
                      {member.user.email}
                    </div>
                  )}
                </div>

                {/* Role badge */}
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${(() => {
                    if (canOwnOrg(member.role)) {
                      return 'bg-pending-tint text-pending dark:bg-pending/30';
                    }
                    if (member.role === ORG_ADMIN_ROLE) {
                      return 'bg-accent text-primary dark:bg-primary/30';
                    }
                    return 'bg-muted text-muted-foreground';
                  })()}`}
                >
                  {t(`role-${member.role}`)}
                </span>

                {/* Joined date */}
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
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
                        onRemove={() =>
                          setMemberPendingRemoval(member.user.email)
                        }
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

      <ConfirmDialog
        open={memberPendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMemberPendingRemoval(null);
          }
        }}
        title={t('confirm-remove-title')}
        description={t('confirm-remove')}
        confirmLabel={t('remove')}
        destructive
        onConfirm={() => {
          if (memberPendingRemoval) {
            void handleRemoveMember(memberPendingRemoval);
          }
        }}
      />
    </div>
  );
}
