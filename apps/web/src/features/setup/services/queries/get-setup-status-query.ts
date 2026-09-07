import 'server-only';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

import type { DatabaseProbe, SetupStatus } from '../../contracts/types';
import { inspectEnvironment } from './inspect-environment';
import { backfillClaimIfAdminExists, isInstallClaimed } from '../install-claim';

/**
 * Everything the first-run screens need to tell an operator where they stand.
 *
 * Deliberately never throws. This runs on the sign-in path, and the whole point
 * is to replace a stack trace with a readable list — a diagnostics screen that
 * crashes when the thing it diagnoses is broken would be worse than none.
 */
export async function getSetupStatusQuery(): Promise<SetupStatus> {
  const report = inspectEnvironment(process.env);

  let database: DatabaseProbe = { reachable: true };
  let adminExists: boolean | null = null;
  let claimed: boolean | null = null;

  try {
    // Counting admins doubles as the connectivity probe — one round trip
    // answers both "is Postgres there" and "has anyone claimed this install".
    const admin = await db.user.findFirst({
      where: { role: 'admin' },
      select: { id: true },
    });
    adminExists = admin !== null;

    // An install that predates the claim marker gets one now, so that
    // removing its last admin cannot reopen the first-run screen. This runs
    // on the sign-in path too, which is why an install in daily use fixes
    // itself without anyone visiting a setup URL.
    await backfillClaimIfAdminExists(adminExists);
    claimed = await isInstallClaimed();
  } catch (error) {
    // Always logged in full. Only surfaced to the browser outside production:
    // this renders on the unauthenticated sign-in page, and a driver error can
    // carry the host, port and user from the connection string.
    logger.error({ err: error }, 'Database unreachable during setup check');

    const detail = error instanceof Error ? error.message : String(error);

    database = {
      reachable: false,
      message: process.env.NODE_ENV === 'production' ? undefined : detail,
    };
  }

  return { report, database, adminExists, claimed };
}
