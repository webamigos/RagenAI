import { closeJobs, jobs } from './jobs.js';
import { registerRecurringSchedules } from './schedules.js';
import { logger } from './services/logger.js';

/**
 * The boot step `worker.ts` runs once the BullMQ workers are consuming:
 * reconcile `RECURRING_SCHEDULES` against the engine.
 *
 * Before it, a schedule existed only where an operator had run its
 * `ensure-*-schedule.ts` script, and nothing ran those on a container install
 * — so the appliance never pruned `document_retrievals` or purged expired
 * memories.
 *
 * Never throws: the workers are already consuming, a missing schedule is not
 * worth a crash loop, and the next start repairs it. The producer's queues are
 * closed afterwards — this process consumes, nothing else in it produces, and
 * an idle connection per queue is a cost with no reader.
 */
export async function registerSchedulesAtBoot(): Promise<void> {
  try {
    await registerRecurringSchedules({ runtime: jobs(), log: logger });
  } catch (err) {
    // registerRecurringSchedules catches per schedule; this is `jobs()`
    // itself failing, which leaves nothing to register with.
    logger.error({ err }, 'recurring schedules were not registered');
  } finally {
    await closeJobs().catch(() => undefined);
  }
}
