import { getTranslations, getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { getCurrentUser, getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { isAppAdmin } from '@/lib/auth-access-control';
import { OrganizationTabs } from '../components/OrganizationTabs';
import db from '@ragenai/prisma-client';
import { getEffectiveFeaturesQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';

type Props = {
  params: Promise<{
    locale: string;
    rest: string[];
  }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale, rest } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const subPath = rest?.[0];

  return {
    title: subPath
      ? t(`organization-profile:${subPath}.title`)
      : t('organization-profile.title'),
  };
}

export default async function OrganizationProfilePage({ params }: Props) {
  // Await params to comply with Next.js 15 requirements
  await params;
  const locale = await getLocale();

  // Auth check
  const user = await getCurrentUser();
  if (!user) {
    return redirect({ href: '/sign-in', locale });
  }

  // Get active organization (with fallback to first organization)
  const organizationId = await getOrgIdFromAuth();

  if (!organizationId) {
    return redirect({ href: '/', locale });
  }

  // Get organization details from database
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    return redirect({ href: '/', locale });
  }

  // Fetch members with user data
  const members = await db.member.findMany({
    where: { organizationId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Fetch invitations
  const invitations = await db.invitation.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
  });

  // Get current user's role
  const activeMember = members.find((m) => m.userId === user.id);

  // App admins bypass all feature gates; otherwise resolve via plan + per-org overrides.
  const features = await getEffectiveFeaturesQuery(organizationId);
  const allowInvite = isAppAdmin(user) || features.inviteMembers;

  return (
    <div className="max-w-2xl">
      <OrganizationTabs
        organization={{
          id: organization.id,
          name: organization.name,
          members: members.map((m) => ({
            id: m.id,
            userId: m.userId,
            role: m.role,
            createdAt: m.createdAt,
            user: {
              id: m.user.id,
              name: m.user.name || undefined,
              email: m.user.email,
              image: m.user.image || undefined,
            },
          })),
        }}
        invitations={invitations.map((inv) => ({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          status: inv.status as 'pending' | 'accepted' | 'rejected' | 'expired',
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
          inviterId: inv.inviterId || undefined,
        }))}
        currentUserRole={activeMember?.role || 'member'}
        currentUserEmail={user.email}
        allowInvite={allowInvite}
      />
    </div>
  );
}
