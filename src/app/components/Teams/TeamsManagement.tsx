'use client';

import { useState, useCallback } from 'react';
import { TeamsList } from './TeamsList';
import { TeamDetail } from './TeamDetail';
import { getTeams, getTeamDetails } from '@/app/actions/teams';
import type {
  TeamListItem,
  TeamDetails,
} from '@/features/teams/contracts/team.types';
import type { TeamUsage } from '@/features/teams/services/queries/get-team-usage-query';
import type { AvailableModel } from '@/app/components/config';

type OrgMember = {
  id: string;
  userId: string;
  name?: string;
  email: string;
};

type Props = {
  initialTeams: TeamListItem[];
  initialUsage: Record<string, TeamUsage>;
  organizationId: string;
  orgMembers: OrgMember[];
  availableModels: AvailableModel[];
  canManage: boolean;
};

export function TeamsManagement({
  initialTeams,
  initialUsage,
  organizationId,
  orgMembers,
  availableModels,
  canManage,
}: Props) {
  const [teams, setTeams] = useState(initialTeams);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamDetails, setTeamDetails] = useState<TeamDetails | null>(null);

  const refreshTeams = useCallback(async () => {
    const updated = await getTeams();
    setTeams(updated);
  }, []);

  const refreshTeamDetails = useCallback(async () => {
    if (!selectedTeamId) {
      return;
    }
    const details = await getTeamDetails(selectedTeamId);
    if (details) {
      setTeamDetails(details);
    } else {
      // Team was deleted
      setSelectedTeamId(null);
      setTeamDetails(null);
      refreshTeams();
    }
  }, [selectedTeamId, refreshTeams]);

  const handleSelectTeam = useCallback(async (teamId: string) => {
    const details = await getTeamDetails(teamId);
    if (details) {
      setSelectedTeamId(teamId);
      setTeamDetails(details);
    }
  }, []);

  const handleBack = useCallback(() => {
    setSelectedTeamId(null);
    setTeamDetails(null);
    refreshTeams();
  }, [refreshTeams]);

  if (selectedTeamId && teamDetails) {
    return (
      <TeamDetail
        team={teamDetails}
        orgMembers={orgMembers}
        canManage={canManage}
        availableModels={availableModels}
        onBack={handleBack}
        onRefresh={refreshTeamDetails}
      />
    );
  }

  return (
    <TeamsList
      teams={teams}
      usage={initialUsage}
      organizationId={organizationId}
      canManage={canManage}
      onSelectTeam={handleSelectTeam}
      onRefresh={refreshTeams}
    />
  );
}
