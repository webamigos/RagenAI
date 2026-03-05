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
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
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
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No teams yet.
            {canManage && ' Create a team to get started.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {teams.map((team) => (
            <div
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
              className="flex cursor-pointer items-center gap-3 rounded-lg py-3 px-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              {/* Team icon */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700">
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                  {team.name[0].toUpperCase()}
                </span>
              </div>

              {/* Team info */}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-950 dark:text-white">
                  {team.name}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {team.memberCount}{' '}
                  {team.memberCount === 1 ? 'member' : 'members'}
                </div>
              </div>

              {/* Created date */}
              <span className="hidden shrink-0 text-xs text-zinc-400 sm:block dark:text-zinc-500">
                {new Date(team.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          ))}
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
