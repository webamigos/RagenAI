import { db } from '../../services/db';
import { logger } from '../../services/logger';
import {
  DEMO_ORGANIZATION_ID,
  DEMO_THREAD_RETENTION_HOURS,
} from '../../consts';

export type DeleteStaleDemoThreadsResult = {
  skipped: boolean;
  threadsDeleted: number;
  messagesDeleted: number;
};

/**
 * Remove the demo organization's abandoned conversations.
 *
 * The organization is named by `DEMO_ORGANIZATION_ID` rather than derived from
 * `TARGET_ENV`. The demo's restrictions are per-organization feature flags
 * precisely so that "demo" is a property of a tenant and not of a deployment;
 * branching on the environment here would contradict that and would make the
 * job untestable anywhere but the demo environment.
 *
 * Unset means off. A cleanup job that deletes threads is not something to
 * enable by accident in an environment that merely forgot to configure it, so
 * the absence of the variable is a skip, reported as such, rather than a
 * default target.
 */
export async function deleteStaleDemoThreads(): Promise<DeleteStaleDemoThreadsResult> {
  if (!DEMO_ORGANIZATION_ID) {
    logger.info(
      'Demo thread cleanup skipped: DEMO_ORGANIZATION_ID is not set. This is the expected state outside the demo environment.',
    );
    return { skipped: true, threadsDeleted: 0, messagesDeleted: 0 };
  }

  const staleBefore = new Date(
    Date.now() - DEMO_THREAD_RETENTION_HOURS * 60 * 60 * 1000,
  );

  const { threadsDeleted, messagesDeleted } = await db.deleteStaleThreads(
    DEMO_ORGANIZATION_ID,
    staleBefore,
  );

  logger.info(
    {
      organizationId: DEMO_ORGANIZATION_ID,
      staleBefore: staleBefore.toISOString(),
      retentionHours: DEMO_THREAD_RETENTION_HOURS,
      threadsDeleted,
      messagesDeleted,
    },
    'Demo thread cleanup completed',
  );

  return { skipped: false, threadsDeleted, messagesDeleted };
}
