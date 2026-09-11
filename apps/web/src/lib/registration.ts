import 'server-only';

import db from '@ragenai/prisma-client';
import {
  REGISTRATION_ENABLED_KEY,
  registrationIsEnabled,
} from '@ragenai/platform-contracts';
import { isInstallClaimed } from '@/features/setup/services/install-claim';

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

/**
 * The very first account on an install nobody has claimed yet.
 *
 * `/initial-account` exists to create that account, and registration
 * defaults to closed — so without this exemption a brand-new install is a
 * deadlock: the setup screen offers a form its own backend refuses, and
 * there is no administrator yet to open registration or send an invitation.
 * Every self-hoster hits it on their first run; `npx create-ragen-app` hits
 * it every single time.
 *
 * This is the same invariant `updateInitialAdminAccountCommand` already
 * enforces before it promotes anyone — the install is unclaimed and holds no
 * user rows — so the widest thing it can ever admit is one account on an
 * empty install. It closes for good the moment that account exists, because
 * the claim marker is one-way and a second call would also see a user row.
 *
 * ## The window this leaves
 *
 * The check and Better Auth's insert are not one transaction, and the hook
 * has no way to make them one — the insert is the library's, not ours. Two
 * sign-ups landing in the same few milliseconds on a fresh install can both
 * pass here, and then `updateInitialAdminAccountCommand` refuses both,
 * because it fails closed on "more than one account exists" rather than
 * guessing which stranger to make an administrator. That is the documented
 * choice, and it is the right one: the alternative to a stuck install is
 * handing platform admin to whoever won a race.
 *
 * Stuck is recoverable by hand (promote one row, delete the other); a wrongly
 * promoted admin is not. Nothing widens the window either — it needs two
 * people on the same unconfigured URL in the same instant.
 */
export async function isUnclaimedEmptyInstall(): Promise<boolean> {
  if (await isInstallClaimed()) {
    return false;
  }

  const existing = await db.user.findFirst({ select: { id: true } });
  return existing === null;
}
