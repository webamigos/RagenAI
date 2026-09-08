import 'server-only';

import db from '@ragenai/prisma-client';
import {
  REGISTRATION_ENABLED_KEY,
  registrationIsEnabled,
} from '@ragenai/platform-contracts';

/**
 * Whether this installation lets people create their own account, and the one
 * exemption to it.
 *
 * The switch is enforced in `databaseHooks.user.create.before` (see
 * `auth.ts`) rather than on the sign-up form, because there is more than one
 * door. Email-and-password sign-up is the obvious one; `magicLink` is the
 * other, and it is configured with `disableSignUp: false`, meaning a magic
 * link requested for an unknown address *creates the account*. Gating the
 * form would have left that door open while the UI said closed.
 *
 * Creating the user row is the one thing both doors must do, so that is where
 * the check belongs — and any provider added later inherits it for free
 * instead of needing its own flag.
 */

/** Reads the platform switch. Absent means closed. */
export async function isRegistrationOpen(): Promise<boolean> {
  const row = await db.settings.findUnique({
    where: { key: REGISTRATION_ENABLED_KEY },
    select: { value: true },
  });

  return registrationIsEnabled(row?.value);
}

/**
 * An invitation is the administrator letting someone in by name, so it stands
 * on its own: closing registration stops strangers signing themselves up, not
 * a colleague accepting an invitation that was deliberately sent.
 *
 * The predicate matches the one `create.after` already uses to decide that an
 * invited user joins the inviting organization instead of getting a personal
 * one — same lowercase comparison, same expiry check, same 'pending' status.
 * Both have to agree: a sign-up allowed here and not recognised there would
 * put the new user in an organization of their own.
 */
export async function hasPendingInvitation(email: string): Promise<boolean> {
  const invitation = await db.invitation.findFirst({
    where: {
      email: email.toLowerCase(),
      status: 'pending',
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });

  return invitation !== null;
}

/**
 * The question the sign-up page and the sign-in link actually ask: may *this*
 * person register? Open installations say yes to everyone; closed ones say
 * yes only to someone holding an invitation.
 */
export async function mayRegister(email?: string | null): Promise<boolean> {
  if (await isRegistrationOpen()) {
    return true;
  }

  return email ? hasPendingInvitation(email) : false;
}
