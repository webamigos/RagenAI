'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';
import { CreateTeamDialog } from './CreateTeamDialog';
import type {
  TeamListItem,
  TeamUsage,
} from '@/features/teams/contracts/team.types';

type Props = {
  teams: TeamListItem[];
  usage: Record<string, TeamUsage>;
  organizationId: string;
  canManage: boolean;
  onSelectTeam: (teamId: string) => void;
  onRefresh: () => void;
};

function budgetBarColor(pct: number): string {
  if (pct >= 90) {
    return 'bg-destructive';
  }
  if (pct >= 80) {
    return 'bg-pending';
  }
  return 'bg-primary';
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
  const locale = useLocale();
  const usdFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
      }),
    [locale],
  );
  const formatUsd = (amount: number) => usdFormatter.format(amount);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">
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
          <p className="text-sm text-muted-foreground">
            {t('no-teams')}
            {canManage && ` ${t('no-teams-hint')}`}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
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
              className="flex cursor-pointer items-center gap-3 rounded-lg py-3 px-2 transition-colors hover:bg-muted dark:hover:bg-muted/50"
            >
              {/* Team icon */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-200 dark:bg-paper-700">
                <span className="text-sm font-medium text-muted-foreground">
                  {(team.name[0] || '?').toUpperCase()}
                </span>
              </div>

              {/* Team info */}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">
                  {team.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('member-count', { count: team.memberCount })}
                </div>
              </div>

              {/* Usage (MTD spend + budget bar) */}
              {usage[team.id] ? (
                <div className="hidden w-40 shrink-0 sm:block">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-medium text-foreground">
                      {formatUsd(usage[team.id].spendUsd)}
                    </span>
                    <span className="text-muted-foreground">
                      {formatUsd(usage[team.id].budgetUsdCents / 100)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-paper-200 dark:bg-paper-700">
                    <div
                      className={`h-full ${budgetBarColor(usage[team.id].pctOfBudget)}`}
                      style={{ width: `${usage[team.id].pctOfBudget}%` }}
                    />
                  </div>
                </div>
              ) : (
                <span className="hidden w-40 shrink-0 text-xs text-muted-foreground sm:block">
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
