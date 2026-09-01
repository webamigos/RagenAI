import 'server-only';

import db from '@ragenai/prisma-client';

import type { DatabaseProbe, SetupStatus } from '../../contracts/types';
import { inspectEnvironment } from './inspect-environment';

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

  try {
    // Counting admins doubles as the connectivity probe — one round trip
    // answers both "is Postgres there" and "has anyone claimed this install".
    const admin = await db.user.findFirst({
      where: { role: 'admin' },
      select: { id: true },
    });
    adminExists = admin !== null;
  } catch (error) {
    database = {
      reachable: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return { report, database, adminExists };
}
