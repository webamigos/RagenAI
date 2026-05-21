import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser, getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { getActiveMember } from '@/lib/auth-guards';
import { isOrgAdmin } from '@/lib/auth-access-control';
import { getTeamsQuery } from '@/features/teams/services/queries/get-teams-query';
import { getOrgTeamsUsageQuery } from '@/features/teams/services/queries/get-team-usage-query';
import { TeamsManagement } from '@/app/components/Teams/TeamsManagement';
import { getAvailableModelsForOrganization } from '@/app/lib/actions/checkAvailableProviders';
import { logger } from '@/app/lib/utils/logger';
import db from '@ragenai/prisma-client';

export async function generateMetadata() {
  const t = await getTranslations('Metadata');
  return { title: t('settings-teams.title') };
}

export default async function TeamsSettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }

  const organizationId = await getOrgIdFromAuth();
  if (!organizationId) {
    redirect('/');
  }

  const activeMember = await getActiveMember(organizationId);
  const canManage = isOrgAdmin(activeMember?.role);

  // Each query catches its own failure so a flaky LiteLLM / settings
  // call cannot crash the whole page. The page renders best-effort
  // empty defaults in that case.
  const safe = async <T,>(
    label: string,
    fn: () => Promise<T>,
    fallback: T,
  ): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      logger.error(
        { err: error, label, organizationId },
        'Teams page query failed',
      );
      return fallback;
    }
  };

  const [teams, members, availableModels, teamUsage] = await Promise.all([
    safe('teams', () => getTeamsQuery(organizationId), []),
    safe(
      'members',
      () =>
        db.member.findMany({
          where: { organizationId },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        }),
      [],
    ),
    safe(
      'available-models',
      () => getAvailableModelsForOrganization(organizationId),
      [],
    ),
    safe('team-usage', () => getOrgTeamsUsageQuery(organizationId), {}),
  ]);

  const orgMembers = members.map((m) => ({
    id: m.id,
    userId: m.user.id,
    name: m.user.name || undefined,
    email: m.user.email,
  }));

  return (
    <div className="max-w-2xl">
      <TeamsManagement
        initialTeams={teams}
        initialUsage={teamUsage}
        organizationId={organizationId}
        orgMembers={orgMembers}
        availableModels={availableModels}
        canManage={canManage}
      />
    </div>
  );
}
