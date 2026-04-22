'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';
import { CreateTeamDialog } from './CreateTeamDialog';
import type { TeamListItem } from '@/features/teams/contracts/team.types';
import type { TeamUsage } from '@/features/teams/services/queries/get-team-usage-query';

type Props = {
  teams: TeamListItem[];
  usage: Record<string, TeamUsage>;
  organizationId: string;
  canManage: boolean;
  onSelectTeam: (teamId: string) => void;
  onRefresh: () => void;
};

function formatUsd(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

function budgetBarColor(pct: number): string {
  if (pct >= 90) {
    return 'bg-red-500';
  }
  if (pct >= 80) {
    return 'bg-amber-500';
  }
  return 'bg-blue-500';
}

export function TeamsList({
  teams,
  usage,
  organizationId,
  canManage,
  onSelectTeam,
  onRefresh,
}: Props) {
  const t = useTranslations('teams-page');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
          {t('title')} ({teams.length})
        </h2>
        {canManage && (
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            {t('create-team')}
          </Button>
        )}
      </div>

      {/* Teams list */}
      {teams.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('no-teams')}
            {canManage && ` ${t('no-teams-hint')}`}
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
              aria-label={`${t('select-team')} ${team.name}`}
              className="flex cursor-pointer items-center gap-3 rounded-lg py-3 px-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              {/* Team icon */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700">
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                  {(team.name[0] || '?').toUpperCase()}
                </span>
              </div>

              {/* Team info */}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-950 dark:text-white">
                  {team.name}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t('member-count', { count: team.memberCount })}
                </div>
              </div>

              {/* Usage (MTD spend + budget bar) */}
              {usage[team.id] ? (
                <div className="hidden w-40 shrink-0 sm:block">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {formatUsd(usage[team.id].spendUsd)}
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {formatUsd(usage[team.id].budgetUsdCents / 100)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                    <div
                      className={`h-full ${budgetBarColor(usage[team.id].pctOfBudget)}`}
                      style={{ width: `${usage[team.id].pctOfBudget}%` }}
                    />
                  </div>
                </div>
              ) : (
                <span className="hidden w-40 shrink-0 text-xs text-zinc-400 sm:block dark:text-zinc-500">
                  —
                </span>
              )}
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
