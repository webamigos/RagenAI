import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  InternalAuthError,
  recordInternalAuthFailure,
  verifyInternalSecret,
} from '@/app/api/v1/utils';
import { resendInvitationCommand } from '@/features/organizations/services/commands/resend-invitation-command';
import db from '@ragenai/prisma-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Resend an organization invitation on behalf of the platform admin panel.
 *
 * The panel cannot do this itself. `pendingMagicLinkContext` is an in-memory
 * `Map` bridging `signInMagicLink` to Better Auth's `sendMagicLink` callback in
 * the same process, so the send has to happen here — in apps/web — or the mail
 * goes out with no invitation context.
 *
 * Two gates, not one. `verifyInternalSecret` proves the caller is a Ragen
 * service; `adminUserId` is then re-read from the database and must still hold
 * the platform role and not be banned. The secret alone would let any service
 * that has it mail arbitrary addresses a sign-in link, and this endpoint's
 * whole output is a sign-in link.
 */

const bodySchema = z.object({
  invitationId: z.string().min(1),
  /** The acting platform administrator. Verified below, not trusted. */
  adminUserId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    verifyInternalSecret(request);
  } catch (error) {
    if (error instanceof InternalAuthError) {
      recordInternalAuthFailure(
        request,
        '/api/internal/invitations/resend',
        'bad secret',
      );
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  const admin = await db.user.findUnique({
    where: { id: body.adminUserId },
    select: { id: true, name: true, email: true, role: true, banned: true },
  });

  // Read from the database rather than trusting the caller, and mirror the
  // panel's own guard: a revoked or banned administrator loses this
  // immediately rather than at the end of some cache window.
  if (!admin || admin.banned || admin.role !== 'admin') {
    recordInternalAuthFailure(
      request,
      '/api/internal/invitations/resend',
      'caller is not a platform administrator',
    );
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await resendInvitationCommand({
    invitationId: body.invitationId,
    inviterName: admin.name || admin.email,
  });

  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : 422;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json({
    ok: true,
    email: result.email,
    expiresAt: result.expiresAt.toISOString(),
  });
}
