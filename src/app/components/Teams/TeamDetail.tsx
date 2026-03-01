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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-sm text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            &larr; Back to teams
          </button>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {team.name}
          </h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
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
              <Button
                onClick={handleDeleteTeam}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Delete Team
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Members table */}
      {team.members.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            No members yet. Add members to get started.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  Joined
                </th>
                {canManage && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
              {team.members.map((member) => (
                <tr key={member.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {member.userImage ? (
                        <img
                          src={member.userImage}
                          alt={member.userName || member.userEmail}
                          className="h-10 w-10 rounded-full mr-3"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-indigo-500 flex items-center justify-center mr-3">
                          <span className="text-white font-medium text-sm">
                            {(member.userName ||
                              member.userEmail ||
                              '?')[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {member.userName || member.userEmail}
                        </div>
                        {member.userName && (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {member.userEmail}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(member.joinedAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </td>
                  {canManage && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleRemoveMember(member.userId)}
                        className="text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
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
