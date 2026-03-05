'use client';

import { useState, useCallback } from 'react';
import { Button } from '@ragenai/common-ui/Button';
import { statusToast } from '@/app/lib/utils/toast';
import { authClient } from '@/app/hooks/use-better-auth';
import { AddTeamMemberDialog } from './AddTeamMemberDialog';
import type { TeamDetails } from '@/features/teams/contracts/team.types';

type OrgMember = {
  id: string;
  userId: string;
  name?: string;
  email: string;
};

type Props = {
  team: TeamDetails;
  orgMembers: OrgMember[];
  canManage: boolean;
  onBack: () => void;
  onRefresh: () => void;
};

export function TeamDetail({
  team,
  orgMembers,
  canManage,
  onBack,
  onRefresh,
}: Props) {
  const { successToast, errorToast } = statusToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const handleRemoveMember = useCallback(
    async (userId: string) => {
      if (!confirm('Remove this member from the team?')) {
        return;
      }

      try {
        await authClient.organization.removeTeamMember({
          teamId: team.id,
          userId,
        });
        successToast({ message: 'Member removed from team' });
        onRefresh();
      } catch {
        errorToast({ message: 'Failed to remove member' });
      }
    },
    [team.id, successToast, errorToast, onRefresh],
  );

  const handleDeleteTeam = useCallback(async () => {
    if (
      !confirm(
        'Delete this team? This will remove all members and unshare associated threads.',
      )
    ) {
      return;
    }

    try {
      await authClient.organization.removeTeam({
        teamId: team.id,
      });
      successToast({ message: 'Team deleted' });
      onBack();
    } catch {
      errorToast({ message: 'Failed to delete team' });
    }
  }, [team.id, successToast, errorToast, onBack]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
        >
          &larr; Back to teams
        </button>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
              {team.name}
            </h2>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              ({team.members.length}{' '}
              {team.members.length === 1 ? 'member' : 'members'})
            </span>
          </div>
          <div className="flex gap-2">
            {canManage && (
              <>
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  Add Member
                </Button>
                <button
                  onClick={handleDeleteTeam}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  Delete Team
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Members list */}
      {team.members.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No members yet. Add members to get started.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {team.members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 py-3">
              {/* Avatar */}
              {member.userImage ? (
                <img
                  src={member.userImage}
                  alt={member.userName || member.userEmail}
                  className="h-9 w-9 shrink-0 rounded-full"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                    {(member.userName ||
                      member.userEmail ||
                      '?')[0].toUpperCase()}
                  </span>
                </div>
              )}

              {/* User info */}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-950 dark:text-white">
                  {member.userName || member.userEmail}
                </div>
                {member.userName && (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {member.userEmail}
                  </div>
                )}
              </div>

              {/* Joined date */}
              <span className="hidden shrink-0 text-xs text-zinc-400 sm:block dark:text-zinc-500">
                {new Date(member.joinedAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>

              {/* Actions */}
              {canManage && (
                <button
                  onClick={() => handleRemoveMember(member.userId)}
                  className="shrink-0 text-sm text-red-600 transition-colors hover:text-red-500 dark:text-red-400 dark:hover:text-red-300"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <AddTeamMemberDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        teamId={team.id}
        existingMemberIds={team.members.map((m) => m.userId)}
        orgMembers={orgMembers}
        onAdded={onRefresh}
      />
    </div>
  );
}
