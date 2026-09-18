import { afterEach, describe, expect, it } from 'vitest';

import type { JobSchedule } from '@ragenai/jobs';

import { startHarness, traits, type JobRuntimeHarness } from './harness.js';

/**
 * The two nightly jobs, driven by the engine's own scheduler.
 *
 * `ensure-demo-cleanup-schedule.ts` and `ensure-analytics-retention-schedule.ts`
 * are run by hand against a deployment, so nothing else in this repository ever
 * exercises the path — and a schedule that silently created a *second* copy of
 * itself on each run would show up as two nightly deletes interleaving, months
 * later, in production.
 *
 * **The cadence here is seconds, not nights**, and it is the one thing in this
 * file the engine gets to choose: the production patterns are five-field and
 * fire once a day, while a suite waiting for those would be measuring its own
 * patience. The dialects differ — see `RuntimeTraits.everyFewSeconds` — and
 * Temporal's way of disagreeing is to accept BullMQ's string and never fire it.
 * What is being proven is the plumbing: registration, firing, idempotent
 * re-registration, deletion.
 */
const SCHEDULE: JobSchedule = {
  id: 'jobs-integration-demo-cleanup',
  job: 'cleanupDemoThreads',
  cron: traits().everyFewSeconds,
  timezone: 'Europe/Warsaw',
};

/**
 * A second, different cadence — what it changes *to* does not matter, only
 * that the spec changed, which is what the upsert has to survive. Derived from
 * the first so it stays in whichever dialect this run speaks.
 */
const A_DIFFERENT_CADENCE = SCHEDULE.cron.replace('2', '3');

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function waitForCalls(
  mock: { mock: { calls: unknown[] } },
  atLeast: number,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (mock.mock.calls.length >= atLeast) {
      return;
    }
    await sleep(100);
  }
  throw new Error(
    `expected at least ${atLeast} calls, saw ${mock.mock.calls.length}`,
  );
}

describe('schedules', () => {
  let harness: JobRuntimeHarness;

  afterEach(async () => {
    await harness?.jobs.deleteSchedule(SCHEDULE.id).catch(() => undefined);
    await harness?.close();
  });

  it('fires the scheduled job without a producer', async () => {
    harness = await startHarness();

    await harness.jobs.upsertSchedule(SCHEDULE);
    await waitForCalls(harness.activities.deleteStaleDemoThreads, 1);

    // The scheduled jobs take no payload, and this is what that means in
    // practice: the handler ran with nobody to supply one.
    expect(
      harness.activities.restoreDemoOrganizationRestrictions,
    ).toHaveBeenCalled();
  });

  it('re-registering the same id does not create a second schedule', async () => {
    harness = await startHarness();

    await harness.jobs.upsertSchedule(SCHEDULE);
    await harness.jobs.upsertSchedule(SCHEDULE);
    await harness.jobs.upsertSchedule({
      ...SCHEDULE,
      cron: A_DIFFERENT_CADENCE,
    });

    // The ensure-scripts are run by hand and re-run without thinking. Three
    // registrations, one schedule.
    await expect(harness.listScheduleIds()).resolves.toEqual([SCHEDULE.id]);
  });

  it('stops firing once the schedule is deleted', async () => {
    harness = await startHarness();

    await harness.jobs.upsertSchedule(SCHEDULE);
    await waitForCalls(harness.activities.deleteStaleDemoThreads, 1);

    await harness.jobs.deleteSchedule(SCHEDULE.id);
    await expect(harness.listScheduleIds()).resolves.toEqual([]);

    const afterDelete =
      harness.activities.deleteStaleDemoThreads.mock.calls.length;
    await sleep(5_000);

    // The `--delete` flag on both ensure-scripts is a required rollout step
    // precisely because a schedule outlives the code that defined it. If
    // deletion did not stop the firing, that step would be theatre.
    expect(harness.activities.deleteStaleDemoThreads.mock.calls.length).toBe(
      afterDelete,
    );
  });
});
