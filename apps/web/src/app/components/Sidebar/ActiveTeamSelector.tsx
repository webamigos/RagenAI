'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarItem, SidebarLabel } from '@ragenai/tui/sidebar';
import { UsersIcon } from '@heroicons/react/24/outline';
import { ChevronsUpDownIcon } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { setActiveTeam } from '@/app/actions/teams';

type Team = {
  id: string;
  name: string;
};

type Props = {
  teams: Team[];
  activeTeamId: string | null;
};

export function ActiveTeamSelector({ teams, activeTeamId }: Props) {
  const t = useTranslations('sidebar');
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Don't render when the user has no teams — the org key is the only path.
  if (teams.length === 0) {
    return null;
  }

  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? null;
  const label = activeTeam?.name ?? t('active-team-personal');

  const handleSelect = (teamId: string | null) => {
    startTransition(async () => {
      const result = await setActiveTeam(teamId);
      if (result.success) {
        router.refresh();
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarItem data-testid="active-team-selector">
          <UsersIcon className="size-5 shrink-0 stroke-muted-foreground" />
          <SidebarLabel className="truncate font-normal">{label}</SidebarLabel>
          <ChevronsUpDownIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </SidebarItem>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuItem
          onSelect={() => handleSelect(null)}
          disabled={activeTeamId == null}
        >
          {t('active-team-personal')}
        </DropdownMenuItem>
        {teams.length > 0 && <DropdownMenuSeparator />}
        {teams.map((team) => (
          <DropdownMenuItem
            key={team.id}
            onSelect={() => handleSelect(team.id)}
            disabled={team.id === activeTeamId}
          >
            {team.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
