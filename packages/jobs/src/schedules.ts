import type { JobSchedule } from './runtime-contract';

/**
 * The daily thread-retention run (spec
 * 2026-10-17-ragen-as-an-on-premises-appliance, B4).
 *
 * Declared here rather than in the worker's script alone because two places
 * register it: `apps/worker`'s `ensure-thread-retention-schedule.ts`, which an
 * operator runs like the other schedules, and `apps/web`, which upserts it
 * when an owner or admin turns retention on. The second is what makes the
 * panel's "runs daily" true on an installation where nobody ran the script —
 * a retention period with no schedule behind it is a setting that deletes
 * nothing. Both must name the same id, or the upsert creates a second
 * schedule instead of being a no-op.
 *
 * 04:30 Europe/Warsaw: after the demo cleanup (03:00), the analytics prune
 * (03:30) and the memory purge (04:00), so no two nightly deletes run against
 * the database at once. The zone is the worker's `SCHEDULE_TIMEZONE`, which
 * its schedules test holds this to.
 */
export const THREAD_RETENTION_SCHEDULE = {
  id: 'thread-retention',
  job: 'pruneExpiredThreads',
  cron: '30 4 * * *',
  timezone: 'Europe/Warsaw',
} as const satisfies JobSchedule;
