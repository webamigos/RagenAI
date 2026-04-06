'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '../lib/utils/auth-helpers';
import { getUserTeamIds } from '@/lib/auth-guards';
import { getTeamsQuery } from '@/features/teams/services/queries/get-teams-query';
import { getTeamDetailsQuery } from '@/features/teams/services/queries/get-team-details-query';
import { getUserTeamsQuery } from '@/features/teams/services/queries/get-user-teams-query';
import { shareThreadWithTeamCommand } from '@/features/teams/services/commands/share-thread-with-team-command';

export async function getTeams() {
  const orgId = await getOrgIdFromAuthOrThrow();
  return getTeamsQuery(orgId);
}

export async function getTeamDetails(teamId: string) {
  const orgId = await getOrgIdFromAuthOrThrow();
  return getTeamDetailsQuery(teamId, orgId);
}

export async function getUserTeams() {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }
  return getUserTeamsQuery(orgId, userId);
}

export async function getCurrentUserTeamIds() {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return [];
  }
  return getUserTeamIds(orgId, userId);
}

export async function shareThreadWithTeam(
  threadId: string,
  teamId: string | null,
) {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { success: false as const, error: 'Not authenticated' };
  }
  return shareThreadWithTeamCommand(threadId, teamId, orgId, userId);
}
