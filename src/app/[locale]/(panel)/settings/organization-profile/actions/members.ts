'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { getSubscriptionData } from '../../subscription/actions';
import { revalidatePath } from 'next/cache';
import { logger } from '@/app/lib/utils/logger';
import db from '@ragenai/prisma-client';

const TRIAL_PLAN_NAME = 'Trial';
const FREE_PLAN_NAME = 'Free';

/**
 * Helper function to get active member from current session
 */
async function getActiveMemberFromSession(organizationId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return null;
  }

  const member = await db.member.findFirst({
    where: {
      organizationId,
      userId: session.user.id,
    },
  });

  return member;
}

/**
 * Zapraszanie nowego członka do organizacji
 * Waliduje: feature flag, plan subskrypcji, duplikaty email
 */
export async function inviteMember(
  email: string,
  role: 'admin' | 'member',
  organizationId: string
) {
  try {
    // 1. Sprawdź permissions
    const activeMember = await getActiveMemberFromSession(organizationId);

    if (!activeMember || !['admin', 'owner'].includes(activeMember.role)) {
      return {
        success: false,
        error: 'Nie masz uprawnień do zapraszania członków',
      };
    }

    // 2. Sprawdź feature flag + plan
    const FEATURE_FLAG =
      !!process.env.FEATURE_FLAG_ALLOW_INVITE_TO_ORGANIZATION;
    const subscription = await getSubscriptionData();
    const planName = subscription?.plan?.name;

    const allowAddMembers =
      FEATURE_FLAG &&
      planName &&
      planName !== TRIAL_PLAN_NAME &&
      planName !== FREE_PLAN_NAME;

    if (!allowAddMembers) {
      return {
        success: false,
        error: 'Zapraszanie członków dostępne tylko w płatnych planach',
      };
    }

    // 3. Sprawdź czy email już w organizacji
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
    const session = await auth.api.getSession({ headers: await headers() });
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await db.invitation.create({
      data: {
        id: `inv_${Math.random().toString(36).substr(2, 9)}`,
        organizationId,
        email: email.toLowerCase(),
        role,
        status: 'pending',
        expiresAt,
        inviterId: session?.user?.id,
      },
    });

    logger.info(
      { email, role, organizationId },
      'Invitation sent successfully'
    );

    revalidatePath('/settings/organization-profile');

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
  organizationId: string
) {
  try {
    // 1. Sprawdź permissions
    const activeMember = await getActiveMemberFromSession(organizationId);

    if (!activeMember || !['admin', 'owner'].includes(activeMember.role)) {
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
      memberToRemove = await db.member.findUnique({
        where: { id: memberIdOrEmail },
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
      'Member removed successfully'
    );

    revalidatePath('/settings/organization-profile');

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
  organizationId: string
) {
  try {
    // 1. Sprawdź permissions
    const activeMember = await getActiveMemberFromSession(organizationId);

    if (!activeMember || !['admin', 'owner'].includes(activeMember.role)) {
      return {
        success: false,
        error: 'Nie masz uprawnień do zmiany ról',
      };
    }

    // 2. Znajdź członka i sprawdź czy nie jest właścicielem
    const targetMember = await db.member.findUnique({
      where: { id: memberId },
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
      where: { id: memberId },
      data: { role },
    });

    logger.info(
      { memberId, role, organizationId },
      'Role updated successfully'
    );

    revalidatePath('/settings/organization-profile');

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Error updating member role');
    return {
      success: false,
      error: 'Wystąpił błąd podczas zmiany roli',
    };
  }
}
