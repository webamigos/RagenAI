import 'server-only';

import { randomUUID } from 'node:crypto';

import { logger } from '@/app/lib/utils/logger';
import { jobs } from '@/libs/jobs';

/**
 * Ask the worker to re-run the organization's computed findings (spec D2b).
 *
 * After the decision has committed, never inside it: the decision stands
 * whether or not a queue is reachable, and the next extraction run reconciles
 * anyway. So a failed enqueue is logged, not thrown — a reviewer whose
 * approval was recorded must not be told it failed because Redis blinked.
 * A fresh run id each time: the job is idempotent, and reusing one would let
 * a finished run swallow the next request.
 */
export async function startFindingsReconcile(orgId: string): Promise<void> {
  try {
    await jobs().start(
      'brainReconcileFindings',
      `brain-reconcile-${randomUUID()}`,
      {
        orgId,
      },
    );
  } catch (error) {
    logger.warn(
      { orgId, error: error instanceof Error ? error.message : String(error) },
      'brain: could not start findings reconcile after a decision',
    );
  }
}
