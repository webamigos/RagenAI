import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser, getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { getActiveMember } from '@/lib/auth-guards';
import { isOrgAdmin } from '@/lib/auth-access-control';
import { getTeamsQuery } from '@/features/teams/services/queries/get-teams-query';
import { TeamsManagement } from '@/app/components/Teams/TeamsManagement';
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

  const [teams, members] = await Promise.all([
    getTeamsQuery(organizationId),
    db.member.findMany({
      where: { organizationId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
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
        organizationId={organizationId}
        orgMembers={orgMembers}
        canManage={canManage}
      />
    </div>
  );
}
