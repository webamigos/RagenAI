'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { logger } from '@/app/lib/utils/logger';
import db from '@ragenai/prisma-client';

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
 * Anulowanie zaproszenia
 */
export async function cancelInvitation(invitationId: string) {
  try {
    // Get invitation to find organizationId
    const invitation = await db.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      return {
        success: false,
        error: 'Zaproszenie nie znalezione',
      };
    }

    // Sprawdź permissions
    const activeMember = await getActiveMemberFromSession(
      invitation.organizationId
    );

    if (!activeMember || !['admin', 'owner'].includes(activeMember.role)) {
      return {
        success: false,
        error: 'Nie masz uprawnień do anulowania zaproszeń',
      };
    }

    // Anuluj zaproszenie (delete from database)
    await db.invitation.delete({
      where: { id: invitationId },
    });

    logger.info({ invitationId }, 'Invitation canceled successfully');

    revalidatePath('/settings/organization-profile');

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Error canceling invitation');
    return {
      success: false,
      error: 'Wystąpił błąd podczas anulowania zaproszenia',
    };
  }
}

/**
 * Ponowne wysłanie zaproszenia
 */
export async function resendInvitation(
  email: string,
  role: string,
  organizationId: string
) {
  try {
    // Sprawdź permissions
    const activeMember = await getActiveMemberFromSession(organizationId);

    if (!activeMember || !['admin', 'owner'].includes(activeMember.role)) {
      return {
        success: false,
        error: 'Nie masz uprawnień do wysyłania zaproszeń',
      };
    }

    // Update or create invitation with new expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    const session = await auth.api.getSession({ headers: await headers() });

    const invitationId = `inv_${Math.random().toString(36).substr(2, 9)}`;

    const invitation = await db.invitation.upsert({
      where: {
        organizationId_email: {
          organizationId,
          email,
        },
      },
      update: {
        expiresAt,
        status: 'pending',
      },
      create: {
        id: invitationId,
        organizationId,
        email,
        role,
        status: 'pending',
        expiresAt,
        inviterId: session?.user?.id,
      },
    });

    // Fetch organization and inviter details for email
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });

    const inviter = session?.user?.name;

    // Send invitation email
    const { sendInvitationEmail } = await import(
      '@/app/emails/services/mailer'
    );
    const emailResult = await sendInvitationEmail({
      to: email,
      organizationName: organization?.name || 'Organization',
      inviterName: inviter,
      role,
      invitationId: invitation.id,
      expiresAt,
    });

    if (emailResult.error) {
      logger.error(
        { email, organizationId, error: emailResult.error },
        'Failed to send invitation email'
      );
      // Don't fail the whole operation - invitation is updated
    }

    logger.info(
      { email, role, organizationId, invitationId: invitation.id },
      'Invitation resent successfully'
    );

    revalidatePath('/settings/organization-profile');

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Error resending invitation');
    return {
      success: false,
      error: 'Wystąpił błąd podczas ponownego wysyłania zaproszenia',
    };
  }
}
