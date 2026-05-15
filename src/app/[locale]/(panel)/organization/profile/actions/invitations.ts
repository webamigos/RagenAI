'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { logger } from '@/app/lib/utils/logger';
import db from '@ragenai/prisma-client';
import { getActiveMember } from '@/lib/auth-guards';
import { isOrgAdmin } from '@/lib/auth-access-control';
import { pendingMagicLinkContext } from '@/lib/magic-link-context';

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
    const activeMember = await getActiveMember(invitation.organizationId);

    if (!activeMember || !isOrgAdmin(activeMember.role)) {
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

    revalidatePath('/organization/profile');

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
  organizationId: string,
) {
  try {
    // Sprawdź permissions
    const activeMember = await getActiveMember(organizationId);

    if (!activeMember || !isOrgAdmin(activeMember.role)) {
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

    // Fetch organization details for the email
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });

    const inviter =
      session?.user?.name || session?.user?.email || 'Twój współpracownik';
    const organizationName = organization?.name || 'Organization';
    const emailKey = email.toLowerCase();

    pendingMagicLinkContext.set(emailKey, {
      type: 'organization-invitation',
      inviterName: inviter,
      organizationName,
      invitationId: invitation.id,
      role,
    });

    try {
      await auth.api.signInMagicLink({
        body: {
          email: emailKey,
          callbackURL: `/accept-invitation?token=${encodeURIComponent(invitation.id)}`,
          newUserCallbackURL: `/accept-invitation?token=${encodeURIComponent(invitation.id)}`,
        },
        headers: await headers(),
      });
    } catch (magicLinkError) {
      pendingMagicLinkContext.delete(emailKey);
      logger.error(
        {
          err: magicLinkError,
          email,
          organizationId,
          invitationId: invitation.id,
        },
        'Failed to dispatch magic-link resend',
      );
      return {
        success: false,
        error: 'Nie udało się wysłać zaproszenia',
      };
    }

    logger.info(
      { email, role, organizationId, invitationId: invitation.id },
      'Invitation resent (magic link)',
    );

    revalidatePath('/organization/profile');

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Error resending invitation');
    return {
      success: false,
      error: 'Wystąpił błąd podczas ponownego wysyłania zaproszenia',
    };
  }
}
