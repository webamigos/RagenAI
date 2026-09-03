import { headers } from 'next/headers';

import { logger } from '@/app/lib/utils/logger';
import { auth } from '@/lib/auth';
import { pendingMagicLinkContext } from '@/lib/magic-link-context';
import db from '@ragenai/prisma-client';

/**
 * Send an existing invitation's magic link again.
 *
 * Extracted from the org-admin server action so the platform admin panel can
 * reuse it through an internal endpoint. It cannot run in the panel's own
 * process: `pendingMagicLinkContext` is an in-memory `Map` bridging this call
 * to Better Auth's `sendMagicLink` callback a few milliseconds later, and its
 * own doc comment says single-process only. A second implementation in
 * apps/admin would have had no way to populate it, so the mail would go out
 * with no invitation context at all.
 *
 * Refreshes an invitation that already exists rather than taking an
 * (email, role, org) triple: `Invitation` is unique on `[organizationId, email]`,
 * so there is exactly one row per pair and "resend" can only ever mean this
 * one. It also means this command cannot invite somebody new, which is the
 * right limit for a platform administrator acting on another organization.
 */

export type ResendInvitationResult =
  | { ok: true; email: string; organizationId: string; expiresAt: Date }
  | { ok: false; reason: 'not_found' | 'not_pending' | 'dispatch_failed' };

/** Matches the 7 days the invite and resend paths in apps/web already use. */
const EXPIRY_DAYS = 7;

export async function resendInvitationCommand({
  invitationId,
  inviterName,
}: {
  invitationId: string;
  /** Shown in the e-mail. The acting administrator, or the original inviter. */
  inviterName: string;
}): Promise<ResendInvitationResult> {
  const invitation = await db.invitation.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      organizationId: true,
    },
  });

  if (!invitation) {
    return { ok: false, reason: 'not_found' };
  }

  // An accepted or rejected invitation must not be revived by a resend — the
  // recipient has already answered, and `acceptInvitation` would refuse it
  // anyway, so the mail would be a dead link.
  if (invitation.status !== 'pending') {
    return { ok: false, reason: 'not_pending' };
  }

  // `Invitation` has no relation to `Organization` — its only relation is
  // `team` — so the name comes from a second read.
  const organization = await db.organization.findUnique({
    where: { id: invitation.organizationId },
    select: { name: true },
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + EXPIRY_DAYS);

  await db.invitation.update({
    where: { id: invitation.id },
    data: { expiresAt, status: 'pending' },
  });

  const emailKey = invitation.email.toLowerCase();

  pendingMagicLinkContext.set(emailKey, {
    type: 'organization-invitation',
    inviterName,
    organizationName: organization?.name || 'Organization',
    invitationId: invitation.id,
    role: invitation.role,
  });

  try {
    const callbackURL = `/accept-invitation?token=${encodeURIComponent(invitation.id)}`;
    await auth.api.signInMagicLink({
      body: { email: emailKey, callbackURL, newUserCallbackURL: callbackURL },
      headers: await headers(),
    });
  } catch (error) {
    pendingMagicLinkContext.delete(emailKey);
    // The row is left refreshed on purpose. Unlike the invite path there is
    // nothing to roll back — the invitation existed before this call and
    // deleting it would lose a pending invitation because a mail failed.
    logger.error(
      { err: error, invitationId: invitation.id },
      'Failed to dispatch invitation resend',
    );
    return { ok: false, reason: 'dispatch_failed' };
  }

  logger.info(
    {
      invitationId: invitation.id,
      organizationId: invitation.organizationId,
      expiresAt,
    },
    'Invitation resent (magic link)',
  );

  return {
    ok: true,
    email: invitation.email,
    organizationId: invitation.organizationId,
    expiresAt,
  };
}
