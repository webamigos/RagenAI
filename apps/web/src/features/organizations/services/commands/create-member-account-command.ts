import 'server-only';

import { randomBytes, randomUUID } from 'node:crypto';

import db from '@ragenai/prisma-client';
import { auth } from '@/lib/auth';
import { logger } from '@/app/lib/utils/logger';
import type { OperationResult } from '@/types/common';
import { canAddMemberQuery } from '../queries/can-add-member-query';

export type CreatedMemberAccount = {
  email: string;
  /**
   * Shown to the administrator once and never stored in readable form — the
   * hash Better Auth writes is all that survives this call.
   */
  temporaryPassword: string;
};

/**
 * Generate a password the administrator hands over out of band.
 *
 * base64url so it survives copy-paste out of a terminal, a chat message or a
 * password manager without escaping; 18 bytes is 144 bits, well past anything
 * that needs to resist offline guessing for the hours it should exist.
 */
function generateTemporaryPassword(): string {
  return randomBytes(18).toString('base64url');
}

/**
 * Create an organization member's account directly, without sending anything.
 *
 * The invitation flow needs working mail: it is a magic link, and the link only
 * ever exists inside the email. On a self-hosted install that is the first
 * thing to break and the hardest to notice, because a failed invitation looks
 * exactly like an invitation the recipient has not opened yet. This path has no
 * such dependency — the administrator receives the credentials as the return
 * value and passes them on however they like.
 *
 * A pending invitation row is still created and immediately accepted. That is
 * not bookkeeping: the user-creation hook in `lib/auth.ts` looks for exactly
 * that row to decide whether the new user gets a personal organization of their
 * own, and without it every account created here would provision a stray org.
 */
export async function createMemberAccountCommand({
  email,
  name,
  role,
  organizationId,
}: {
  email: string;
  name: string;
  role: 'admin' | 'member';
  organizationId: string;
}): Promise<OperationResult<CreatedMemberAccount>> {
  const normalizedEmail = email.trim().toLowerCase();

  const gate = await canAddMemberQuery(organizationId);
  if (!gate.allowed) {
    return { success: false, error: gate.error };
  }

  const existingUser = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existingUser) {
    const alreadyMember = await db.member.findFirst({
      where: { organizationId, userId: existingUser.id },
      select: { id: true },
    });

    return {
      success: false,
      error: alreadyMember
        ? 'Użytkownik o tym adresie email już jest członkiem organizacji'
        : 'Konto z tym adresem email już istnieje — użyj zaproszenia',
    };
  }

  // Invitations are unique per (organization, email), so a pending one would
  // make the insert below fail on a constraint. Say what to do about it rather
  // than quietly cancelling an invitation the admin may still be waiting on.
  const pendingInvitation = await db.invitation.findUnique({
    where: {
      organizationId_email: { organizationId, email: normalizedEmail },
    },
    select: { id: true },
  });

  if (pendingInvitation) {
    return {
      success: false,
      error:
        'Dla tego adresu email istnieje już zaproszenie — anuluj je, aby utworzyć konto',
    };
  }

  const temporaryPassword = generateTemporaryPassword();
  const invitationId = `inv_${randomUUID()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Created before the account so the user-creation hook can see it.
  await db.invitation.create({
    data: {
      id: invitationId,
      organizationId,
      email: normalizedEmail,
      role,
      status: 'pending',
      expiresAt,
      inviterId: gate.inviterId,
    },
  });

  try {
    // No `headers` — this must not hand the administrator's browser a session
    // belonging to the account they just created.
    const created = await auth.api.signUpEmail({
      body: { email: normalizedEmail, password: temporaryPassword, name },
    });

    const userId = created?.user?.id;
    if (!userId) {
      throw new Error('Account creation returned no user');
    }

    await db.$transaction([
      // The administrator vouched for the address; there is no verification
      // mail to wait for, and an unverified account cannot sign in.
      db.user.update({
        where: { id: userId },
        data: { emailVerified: true },
      }),
      db.member.create({
        data: { id: randomUUID(), organizationId, userId, role },
      }),
      db.invitation.update({
        where: { id: invitationId },
        data: { status: 'accepted' },
      }),
    ]);

    logger.info(
      { organizationId, role, userId },
      'Member account created by administrator',
    );

    return {
      success: true,
      data: { email: normalizedEmail, temporaryPassword },
    };
  } catch (error) {
    // Leaving a pending invitation behind would block the admin from retrying
    // with the same address, and would look to them like the invitation flow
    // had succeeded.
    await db.invitation
      .delete({ where: { id: invitationId } })
      .catch(() => undefined);

    logger.error(
      { err: error, organizationId, role },
      'Failed to create member account',
    );

    return {
      success: false,
      error: 'Nie udało się utworzyć konta użytkownika',
    };
  }
}
