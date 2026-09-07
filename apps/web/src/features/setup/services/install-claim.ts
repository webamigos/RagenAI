import 'server-only';

import db from '@ragenai/prisma-client';

/**
 * A one-way marker: this install has had its first admin, so the first-run
 * screen is closed for good.
 *
 * ## Why "an admin exists" was not enough
 *
 * `/initial-account` used to be gated on nothing but that. It is a fair
 * question at the moment of install and a bad one afterwards, because it
 * answers `false` again the moment the last admin goes away — demoted,
 * deleted, or role-cleared by hand. And
 * `updateInitialAdminAccountCommand` only requires "exactly one user and no
 * admin", so on a single-account install the screen would hand the platform
 * admin role to whoever loaded it next. That matters most where it is least
 * expected: a shared demo account cannot safely be demoted while the only
 * thing closing the screen is the role you are removing.
 *
 * The marker is written when the first admin is claimed and never rewritten.
 * `Settings` is a plain key/value table, so this needs no migration.
 *
 * ## Existing installs
 *
 * They have an admin and no marker, so `backfillClaimIfAdminExists` writes
 * one the first time anything asks. That runs from `getSetupStatusQuery`,
 * which the **sign-in** page calls as well as the setup screen — so an
 * install in daily use self-heals without anyone visiting a setup URL.
 */
const CLAIM_KEY = 'initial_setup_claimed_at';

export async function isInstallClaimed(): Promise<boolean> {
  const row = await db.settings.findUnique({
    where: { key: CLAIM_KEY },
    select: { key: true },
  });
  return row !== null;
}

/**
 * Idempotent, and deliberately does not update on conflict: the value is when
 * the install was *first* claimed, and a second write would move that date
 * without meaning anything by it.
 */
export async function markInstallClaimed(): Promise<void> {
  await db.settings.upsert({
    where: { key: CLAIM_KEY },
    update: {},
    create: { key: CLAIM_KEY, value: new Date().toISOString() },
  });
}

/**
 * Closes the door on an install that predates the marker.
 *
 * Never throws: it runs on the sign-in path, behind a status query whose whole
 * job is to replace a stack trace with a readable page. A failed backfill
 * leaves the old behaviour, which is what the caller already handles.
 */
export async function backfillClaimIfAdminExists(
  adminExists: boolean,
): Promise<void> {
  if (!adminExists) {
    return;
  }
  try {
    await markInstallClaimed();
  } catch {
    // Intentionally silent — see above.
  }
}
