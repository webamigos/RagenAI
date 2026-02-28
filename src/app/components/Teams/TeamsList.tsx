'use client';

import { useState } from 'react';
import { Button } from '@ragenai/common-ui/Button';
import { CreateTeamDialog } from './CreateTeamDialog';
import type { TeamListItem } from '@/features/teams/contracts/team.types';

type Props = {
  teams: TeamListItem[];
  organizationId: string;
  canManage: boolean;
  onSelectTeam: (teamId: string) => void;
  onRefresh: () => void;
};

export function TeamsList({
  teams,
  organizationId,
  canManage,
  onSelectTeam,
  onRefresh,
}: Props) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Teams ({teams.length})
        </h2>
        {canManage && (
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            Create Team
          </Button>
        )}
      </div>

      {/* Teams list */}
      {teams.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            No teams yet.
            {canManage && ' Create a team to get started.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  Members
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
              {teams.map((team) => (
                <tr
                  key={team.id}
                  onClick={() => onSelectTeam(team.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectTeam(team.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Select team ${team.name}`}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                      {team.name}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {team.memberCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(team.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateTeamDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        organizationId={organizationId}
        onCreated={onRefresh}
      />
    </div>
  );
}
