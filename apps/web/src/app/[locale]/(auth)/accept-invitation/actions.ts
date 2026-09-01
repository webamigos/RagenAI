'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { syncSeatsToStripe } from '@/features/subscriptions/services/commands/sync-seats-command';

/**
 * Get invitation details for display
 */
export async function getInvitationDetails(invitationId: string) {
  try {
    const invitation = await db.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      return {
        success: false,
        error: 'Zaproszenie nie zostało znalezione',
      };
    }

    // Check if expired
    if (new Date() > invitation.expiresAt) {
      return {
        success: false,
        error: 'To zaproszenie wygasło',
        expired: true,
      };
    }

    // Check if already accepted or rejected
    if (invitation.status !== 'pending') {
      return {
        success: false,
        error: `To zaproszenie zostało już ${
          invitation.status === 'accepted' ? 'zaakceptowane' : 'odrzucone'
        }`,
        alreadyProcessed: true,
      };
    }

    // Fetch organization separately
    const organization = await db.organization.findUnique({
      where: { id: invitation.organizationId },
      select: { name: true },
    });

    return {
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        organizationId: invitation.organizationId,
        organizationName: organization?.name || 'Organization',
        expiresAt: invitation.expiresAt,
      },
    };
  } catch (error) {
    logger.error(
      { err: error, invitationId },
      'Error getting invitation details',
    );
    return {
      success: false,
      error: 'Wystąpił błąd podczas pobierania szczegółów zaproszenia',
    };
  }
}

/**
 * Accept invitation (for logged-in users)
 */
export async function acceptInvitation(invitationId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return {
        success: false,
        error: 'Musisz być zalogowany, aby zaakceptować zaproszenie',
        requiresAuth: true,
      };
    }

    // Get invitation details
    const invitation = await db.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      return {
        success: false,
        error: 'Zaproszenie nie zostało znalezione',
      };
    }

    // Check if expired
    if (new Date() > invitation.expiresAt) {
      return {
        success: false,
        error: 'To zaproszenie wygasło',
      };
    }

    // Check email match
    if (session.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return {
        success: false,
        error: 'To zaproszenie zostało wysłane na inny adres email',
      };
    }

    // Check if already a member
    const existingMember = await db.member.findFirst({
      where: {
        organizationId: invitation.organizationId,
        userId: session.user.id,
      },
    });

    if (existingMember) {
      return {
        success: false,
        error: 'Jesteś już członkiem tej organizacji',
      };
    }

    // Use Better Auth API to accept invitation
    await auth.api.acceptInvitation({
      body: {
        invitationId,
      },
      headers: await headers(),
    });

    // Set the inviting organization as active so the user lands in the right org
    try {
      // @ts-ignore - setActiveOrganization exists but typing is incomplete
      await auth.api.setActiveOrganization({
        body: {
          organizationId: invitation.organizationId,
        },
        headers: await headers(),
      });
    } catch (setActiveError) {
      logger.warn(
        { err: setActiveError, organizationId: invitation.organizationId },
        'Failed to set active org after invitation acceptance',
      );
    }

    logger.info(
      {
        invitationId,
        userId: session.user.id,
        organizationId: invitation.organizationId,
      },
      'Invitation accepted successfully',
    );

    // Sync seat count to Stripe (non-blocking)
    syncSeatsToStripe(invitation.organizationId);

    return {
      success: true,
      organizationId: invitation.organizationId,
    };
  } catch (error) {
    logger.error({ err: error, invitationId }, 'Error accepting invitation');
    return {
      success: false,
      error: 'Wystąpił błąd podczas akceptacji zaproszenia',
    };
  }
}

/**
 * Reject invitation
 */
export async function rejectInvitation(invitationId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return {
        success: false,
        error: 'Musisz być zalogowany, aby odrzucić zaproszenie',
      };
    }

    // Get invitation details
    const invitation = await db.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      return {
        success: false,
        error: 'Zaproszenie nie zostało znalezione',
      };
    }

    // Check email match
    if (session.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return {
        success: false,
        error: 'To zaproszenie zostało wysłane na inny adres email',
      };
    }

    // Update invitation status
    await db.invitation.update({
      where: { id: invitationId },
      data: { status: 'rejected' },
    });

    logger.info(
      { invitationId, userId: session.user.id },
      'Invitation rejected',
    );

    return { success: true };
  } catch (error) {
    logger.error({ err: error, invitationId }, 'Error rejecting invitation');
    return {
      success: false,
      error: 'Wystąpił błąd podczas odrzucania zaproszenia',
    };
  }
}
