'use server';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { revalidatePath } from 'next/cache';

/**
 * The Invitations page was read-only. A stale or misaddressed invitation could
 * not be cancelled, and a lost one could not be resent, from anywhere but the
 * customer's own organization settings.
 */

/**
 * Cancel by status, not by deleting the row.
 *
 * `Invitation` is unique on `[organizationId, email]`, so the row is the only
 * record that the address was ever invited — deleting it loses that, and loses
 * the audit trail's subject with it.
 *
 * Note the divergence this creates: apps/web's own cancel
 * (`organization/profile/actions/invitations.ts`) **deletes** the row. The two
 * should agree, and the status route is the one worth keeping, but changing
 * apps/web's behaviour is a customer-facing change and does not belong in this
 * commit. Flagged rather than silently matched.
 */
export async function cancelInvitationAction(
  invitationId: string,
): Promise<void> {
  const admin = await requireAdmin();

  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    select: { id: true, email: true, status: true, organizationId: true },
  });
  if (!invitation) {
    throw new Error('Invitation not found');
  }

  if (invitation.status !== 'pending') {
    throw new Error(
      `That invitation is already ${invitation.status} — there is nothing to cancel.`,
    );
  }

  // Conditional on still being pending, so two administrators cancelling the
  // same invitation cannot both claim it.
  const { count } = await prisma.invitation.updateMany({
    where: { id: invitation.id, status: 'pending' },
    data: { status: 'canceled' },
  });

  if (count === 0) {
    return;
  }

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.invitationCanceled,
    entityType: 'invitation',
    entityId: invitation.id,
    organizationId: invitation.organizationId,
    before: { email: invitation.email, status: 'pending' },
    after: { status: 'canceled' },
  });

  revalidatePath('/invitations');
  revalidatePath(`/organizations/${invitation.organizationId}`);
}

export type ResendOutcome =
  | { ok: true; email: string; expiresAt: string }
  | { ok: false; reason: string };

/**
 * Resend through apps/web, because the send cannot happen here.
 *
 * `pendingMagicLinkContext` in apps/web is an in-memory `Map` bridging
 * `signInMagicLink` to Better Auth's `sendMagicLink` callback milliseconds
 * later, and its own doc comment says single-process only. Calling
 * `signInMagicLink` from this panel would dispatch a mail with no invitation
 * context — a bare sign-in link instead of an invitation.
 *
 * So this posts to an internal endpoint that runs the shared command in
 * apps/web's process. `RAGEN_APP_URL` and `INTERNAL_API_SECRET` are the same
 * pair apps/worker already uses to reach that app.
 */
export async function resendInvitationAction(
  invitationId: string,
): Promise<ResendOutcome> {
  const admin = await requireAdmin();

  const appUrl = process.env.RAGEN_APP_URL;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!appUrl || !secret) {
    return {
      ok: false,
      reason:
        'Resending needs RAGEN_APP_URL and INTERNAL_API_SECRET configured on the admin app.',
    };
  }

  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    select: { id: true, email: true, status: true, organizationId: true },
  });
  if (!invitation) {
    return { ok: false, reason: 'Invitation not found' };
  }

  let outcome: ResendOutcome;
  try {
    const response = await fetch(`${appUrl}/api/internal/invitations/resend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': secret,
      },
      body: JSON.stringify({ invitationId, adminUserId: admin.id }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      outcome = {
        ok: false,
        reason:
          `apps/web refused the resend: ${response.status} ${detail}`.trim(),
      };
    } else {
      const payload = (await response.json()) as {
        email: string;
        expiresAt: string;
      };
      outcome = {
        ok: true,
        email: payload.email,
        expiresAt: payload.expiresAt,
      };
    }
  } catch (error) {
    outcome = {
      ok: false,
      reason: `Could not reach apps/web: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!outcome.ok) {
    logger.error(
      { invitationId, reason: outcome.reason },
      'Invitation resend failed',
    );
  }

  // Recorded either way. A failed resend is the thing a customer asks about
  // — "you said you sent it" — so the attempt has to be visible, not just the
  // successes.
  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.invitationResent,
    entityType: 'invitation',
    entityId: invitation.id,
    organizationId: invitation.organizationId,
    after: { email: invitation.email, outcome },
  });

  revalidatePath('/invitations');
  return outcome;
}
