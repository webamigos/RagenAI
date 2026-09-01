'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { logger } from '@/app/lib/utils/logger';
import db from '@ragenai/prisma-client';
import { getActiveMember } from '@/lib/auth-guards';
import { isOrgAdmin } from '@/lib/auth-access-control';
import { syncSeatsToStripe } from '@/features/subscriptions/services/commands/sync-seats-command';
import { pendingMagicLinkContext } from '@/lib/magic-link-context';
import { createMemberAccountCommand } from '@/features/organizations/services/commands/create-member-account-command';
import { canAddMemberQuery } from '@/features/organizations/services/queries/can-add-member-query';

/**
 * Zapraszanie nowego członka do organizacji
 * Waliduje: feature flag, plan subskrypcji, duplikaty email
 */
export async function inviteMember(
  email: string,
  role: 'admin' | 'member',
  organizationId: string,
) {
  try {
    // Permissions, plan gate and seat limit — shared with the
    // create-account path so the two cannot drift apart.
    const gate = await canAddMemberQuery(organizationId);

    if (!gate.allowed) {
      return { success: false, error: gate.error };
    }

    // 4. Sprawdź czy email już w organizacji
    const existingUser = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      const existingMember = await db.member.findFirst({
        where: {
          organizationId,
          userId: existingUser.id,
        },
      });

      if (existingMember) {
        return {
          success: false,
          error:
            'Użytkownik o tym adresie email już jest członkiem organizacji',
        };
      }
    }

    // 4. Sprawdź czy nie ma pending invitation
    const existingInvitation = await db.invitation.findFirst({
      where: {
        organizationId,
        email: email.toLowerCase(),
        status: 'pending',
      },
    });

    if (existingInvitation) {
      return {
        success: false,
        error: 'Zaproszenie dla tego adresu email już zostało wysłane',
      };
    }

    // 5. Wyślij zaproszenie
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const invitationId = `inv_${Math.random().toString(36).substr(2, 9)}`;

    await db.invitation.create({
      data: {
        id: invitationId,
        organizationId,
        email: email.toLowerCase(),
        role,
        status: 'pending',
        expiresAt,
        inviterId: gate.inviterId,
      },
    });

    // Fetch organization details for the email
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });

    const inviter = gate.inviterName;
    const organizationName = organization?.name || 'Organization';
    const emailKey = email.toLowerCase();

    // Stash the invitation context where the magic-link callback will read it
    // and dispatch the templated email.
    pendingMagicLinkContext.set(emailKey, {
      type: 'organization-invitation',
      inviterName: inviter,
      organizationName,
      invitationId,
      role,
    });

    try {
      await auth.api.signInMagicLink({
        body: {
          email: emailKey,
          callbackURL: `/accept-invitation?token=${encodeURIComponent(invitationId)}`,
          newUserCallbackURL: `/accept-invitation?token=${encodeURIComponent(invitationId)}`,
        },
        headers: await headers(),
      });
    } catch (magicLinkError) {
      pendingMagicLinkContext.delete(emailKey);
      logger.error(
        { err: magicLinkError, email, organizationId, invitationId },
        'Failed to dispatch magic-link invitation',
      );
      await db.invitation
        .delete({ where: { id: invitationId } })
        .catch(() => undefined);
      return {
        success: false,
        error: 'Nie udało się wysłać zaproszenia',
      };
    }

    logger.info(
      { email, role, organizationId, invitationId },
      'Magic-link invitation dispatched',
    );

    revalidatePath('/organization/profile');

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Error inviting member');
    return {
      success: false,
      error: 'Wystąpił błąd podczas zapraszania członka',
    };
  }
}

/**
 * Usunięcie członka z organizacji
 */
export async function removeMember(
  memberIdOrEmail: string,
  organizationId: string,
) {
  try {
    // 1. Sprawdź permissions
    const activeMember = await getActiveMember(organizationId);

    if (!activeMember || !isOrgAdmin(activeMember.role)) {
      return {
        success: false,
        error: 'Nie masz uprawnień do usuwania członków',
      };
    }

    // 2. Znajdź członka do usunięcia (po email lub id)
    let memberToRemove;
    if (memberIdOrEmail.includes('@')) {
      // To jest email
      const user = await db.user.findUnique({
        where: { email: memberIdOrEmail.toLowerCase() },
      });

      if (user) {
        memberToRemove = await db.member.findFirst({
          where: { organizationId, userId: user.id },
        });
      }
    } else {
      // To jest member ID
      memberToRemove = await db.member.findFirst({
        where: { id: memberIdOrEmail, organizationId },
      });
    }

    if (!memberToRemove) {
      return {
        success: false,
        error: 'Członek nie znaleziony',
      };
    }

    // 3. Sprawdź czy nie próbuje usunąć siebie
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user?.id === memberToRemove.userId) {
      return {
        success: false,
        error: 'Nie możesz usunąć sam siebie. Użyj opcji "Opuść organizację"',
      };
    }

    // 4. Nie można usunąć właściciela
    if (memberToRemove.role === 'owner') {
      return {
        success: false,
        error: 'Nie można usunąć właściciela organizacji',
      };
    }

    // 5. Usuń członka
    await db.member.delete({
      where: { id: memberToRemove.id },
    });

    logger.info(
      { memberIdOrEmail, organizationId },
      'Member removed successfully',
    );

    // Sync seat count to Stripe (non-blocking)
    syncSeatsToStripe(organizationId);

    revalidatePath('/organization/profile');

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Error removing member');
    return {
      success: false,
      error: 'Wystąpił błąd podczas usuwania członka',
    };
  }
}

/**
 * Zmiana roli członka
 */
export async function updateMemberRole(
  memberId: string,
  role: 'admin' | 'member',
  organizationId: string,
) {
  try {
    // 1. Sprawdź permissions
    const activeMember = await getActiveMember(organizationId);

    if (!activeMember || !isOrgAdmin(activeMember.role)) {
      return {
        success: false,
        error: 'Nie masz uprawnień do zmiany ról',
      };
    }

    // 2. Znajdź członka i sprawdź czy nie jest właścicielem
    const targetMember = await db.member.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!targetMember) {
      return {
        success: false,
        error: 'Członek nie znaleziony',
      };
    }

    if (targetMember.role === 'owner') {
      return {
        success: false,
        error: 'Nie można zmienić roli właściciela organizacji',
      };
    }

    // 3. Zmień rolę
    await db.member.update({
      where: { id: targetMember.id },
      data: { role },
    });

    logger.info(
      { memberId, role, organizationId },
      'Role updated successfully',
    );

    revalidatePath('/organization/profile');

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Error updating member role');
    return {
      success: false,
      error: 'Wystąpił błąd podczas zmiany roli',
    };
  }
}

/**
 * Utworzenie konta członka bezpośrednio przez administratora.
 *
 * Zwraca hasło tymczasowe — jedyny moment, w którym jest ono widoczne.
 */
export async function createMemberAccount(
  email: string,
  name: string,
  role: 'admin' | 'member',
  organizationId: string,
) {
  const result = await createMemberAccountCommand({
    email,
    name,
    role,
    organizationId,
  });

  if (result.success) {
    revalidatePath('/organization/profile');
  }

  return result;
}
