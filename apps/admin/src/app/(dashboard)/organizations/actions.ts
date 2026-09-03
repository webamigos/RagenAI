'use server';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';

import { prisma } from '@/lib/db';
import { syncOrgMemberToLiteLLM } from '@/lib/litellm';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

export async function renameOrgAction(orgId: string, name: string) {
  const admin = await requireAdmin();
  if (!name.trim()) {
    throw new Error('Name cannot be empty');
  }

  const before = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });

  await prisma.organization.update({
    where: { id: orgId },
    data: { name: name.trim() },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.orgRenamed,
    entityType: 'organization',
    entityId: orgId,
    organizationId: orgId,
    before: before ?? null,
    after: { name: name.trim() },
  });

  revalidatePath('/organizations');
  revalidatePath(`/organizations/${orgId}`);
}

export async function changeOrgSlugAction(orgId: string, slug: string) {
  const admin = await requireAdmin();
  const trimmed = slug.trim().toLowerCase();

  if (trimmed) {
    const existing = await prisma.organization.findUnique({
      where: { slug: trimmed },
      select: { id: true },
    });
    if (existing && existing.id !== orgId) {
      throw new Error('Slug is already taken');
    }
  }

  const before = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { slug: true },
  });

  await prisma.organization.update({
    where: { id: orgId },
    data: { slug: trimmed || null },
  });

  // The slug is in customer-facing URLs, so a change here can break links that
  // are already in circulation — worth a security event, not just an audit row.
  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.orgSlugChanged,
    entityType: 'organization',
    entityId: orgId,
    organizationId: orgId,
    before: before ?? null,
    after: { slug: trimmed || null },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath('/organizations');
  revalidatePath(`/organizations/${orgId}`);
}

/**
 * Membership, done with Prisma rather than Better Auth's organization plugin.
 *
 * Every member and invitation endpoint that plugin exposes requires the caller
 * to be a `Member` of the target organization — `User.role === 'admin'` grants
 * nothing there, because the plugin has no notion of a platform-level role. A
 * platform administrator acting on somebody else's organization would get
 * `MEMBER_NOT_FOUND` from all of them.
 *
 * Loading the plugin here would also be wrong for a second reason: it registers
 * `organizationHooks`, and apps/web hangs the LiteLLM provisioning off those.
 * The panel has none of that machinery, so mutations made through the plugin
 * here would change membership without provisioning anything. Hence the
 * explicit `syncOrgMemberToLiteLLM` calls below.
 */

const ORG_ROLES = ['owner', 'admin', 'member'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

function assertOrgRole(role: string): OrgRole {
  if (!(ORG_ROLES as readonly string[]).includes(role)) {
    throw new Error(`Invalid organization role: ${role}`);
  }
  return role as OrgRole;
}

/**
 * An organization with no owner cannot be administered by its own members —
 * only `owner` can transfer ownership or delete the organization. The panel is
 * the only way back from that, so it refuses to create the situation.
 */
async function assertNotLastOwner(
  orgId: string,
  userId: string,
): Promise<void> {
  const otherOwners = await prisma.member.count({
    where: { organizationId: orgId, role: 'owner', userId: { not: userId } },
  });
  if (otherOwners === 0) {
    throw new Error(
      'This is the last owner of the organization — promote another member to owner first.',
    );
  }
}

export async function addOrgMemberAction(
  orgId: string,
  email: string,
  role: string,
) {
  const admin = await requireAdmin();
  const orgRole = assertOrgRole(role);
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('E-mail is required');
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true },
  });
  if (!org) {
    throw new Error('Organization not found');
  }

  // The account has to exist. This panel does not create accounts — apps/web's
  // invitation flow and `createMemberAccount` are the paths that do, and both
  // involve the person themselves.
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new Error(
      `No account exists for ${normalizedEmail} — invite them instead.`,
    );
  }

  const existing = await prisma.member.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.id },
    },
    select: { id: true },
  });
  if (existing) {
    throw new Error('That account is already a member of this organization.');
  }

  /**
   * One transaction, because a half-done membership is the failure this whole
   * action exists to avoid. Team membership is what LiteLLM routes on:
   * `resolveLiteLLMKeyQuery` prefers a team key, so a member with the `Member`
   * row but no `TeamMember` rows silently falls back to the organization key
   * and their usage lands against the wrong budget. Joining every team keeps
   * them consistent with a signup, which lands in `{orgId}-general`.
   *
   * Purely local writes, so unlike the Stripe-touching actions there is nothing
   * here that a transaction cannot cover.
   */
  const teams = await prisma.$transaction(async (tx) => {
    await tx.member.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        userId: user.id,
        role: orgRole,
      },
    });

    const orgTeams = await tx.team.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });

    for (const team of orgTeams) {
      await tx.teamMember.upsert({
        where: { teamId_userId: { teamId: team.id, userId: user.id } },
        update: {},
        create: { id: randomUUID(), teamId: team.id, userId: user.id },
      });
    }

    return orgTeams;
  });

  const sync = await syncOrgMemberToLiteLLM(
    orgId,
    { userId: user.id, userEmail: user.email },
    'add',
  );

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.memberAdded,
    entityType: 'member',
    entityId: user.id,
    organizationId: orgId,
    after: {
      email: user.email,
      role: orgRole,
      teamsJoined: teams.length,
      litellmSync: sync,
    },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED', severity: 'warn' },
  });

  revalidatePath(`/organizations/${orgId}`);
  return sync;
}

export async function removeOrgMemberAction(orgId: string, userId: string) {
  const admin = await requireAdmin();

  const member = await prisma.member.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
    select: { id: true, role: true, user: { select: { email: true } } },
  });
  if (!member) {
    throw new Error('That account is not a member of this organization.');
  }

  if (member.role === 'owner') {
    await assertNotLastOwner(orgId, userId);
  }

  // Same reasoning in reverse: team membership must not outlive organization
  // membership, because a team key keeps working for whoever holds it.
  const teamsLeft = await prisma.$transaction(async (tx) => {
    await tx.member.delete({ where: { id: member.id } });
    const { count } = await tx.teamMember.deleteMany({
      where: { userId, team: { organizationId: orgId } },
    });
    return count;
  });

  const sync = await syncOrgMemberToLiteLLM(
    orgId,
    { userId, userEmail: member.user.email },
    'remove',
  );

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.memberRemoved,
    entityType: 'member',
    entityId: userId,
    organizationId: orgId,
    before: { email: member.user.email, role: member.role },
    after: { teamsLeft, litellmSync: sync },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED', severity: 'warn' },
  });

  revalidatePath(`/organizations/${orgId}`);
  return sync;
}

export async function changeOrgMemberRoleAction(
  orgId: string,
  userId: string,
  role: string,
) {
  const admin = await requireAdmin();
  const orgRole = assertOrgRole(role);

  const member = await prisma.member.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
    select: { id: true, role: true, user: { select: { email: true } } },
  });
  if (!member) {
    throw new Error('That account is not a member of this organization.');
  }

  if (member.role === orgRole) {
    return;
  }

  if (member.role === 'owner') {
    await assertNotLastOwner(orgId, userId);
  }

  await prisma.member.update({
    where: { id: member.id },
    data: { role: orgRole },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.memberRoleChanged,
    entityType: 'member',
    entityId: userId,
    organizationId: orgId,
    before: { role: member.role },
    after: { role: orgRole, email: member.user.email },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath(`/organizations/${orgId}`);
}
