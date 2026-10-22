/**
 * Per-organization thread retention (spec
 * 2026-10-17-ragen-as-an-on-premises-appliance, B4).
 *
 * Shared by apps/web, which offers and saves the period, and apps/worker,
 * which deletes by it. Both must agree on which values exist: a period the
 * panel can save and the worker does not recognise is a setting that reads as
 * active and deletes nothing, and the reverse is a deletion nobody chose.
 *
 * Presets rather than a free number, by decision: a typo of `3` for `30` is a
 * deletion of almost everything, and nothing in a form field can make that
 * reversible.
 */

/** The periods an owner or admin can choose. `null` (off) is the default. */
export const THREAD_RETENTION_DAYS_OPTIONS = [30, 90, 180, 365] as const;

export type ThreadRetentionDays =
  (typeof THREAD_RETENTION_DAYS_OPTIONS)[number];

/** Whether `value` is one of the presets. `null` is off, not a preset. */
export function isThreadRetentionDays(
  value: unknown,
): value is ThreadRetentionDays {
  return (
    typeof value === 'number' &&
    (THREAD_RETENTION_DAYS_OPTIONS as readonly number[]).includes(value)
  );
}

const DAY_MS = 86_400_000;

/**
 * The moment before which a thread's last activity makes it expired.
 *
 * Whole days of 24 hours from `now`, not calendar days: the job runs daily,
 * so a thread is deleted on the first run after it has been quiet for the
 * full period, never before.
 */
export function threadRetentionCutoff(
  days: ThreadRetentionDays,
  now: Date,
): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/**
 * Whether moving from `current` to `next` can delete a thread that would have
 * survived under `current`: turning retention on, or shortening it.
 *
 * The panel asks for confirmation exactly when this is true. Turning it off
 * or lengthening the period deletes nothing that was not already going.
 */
export function isThreadRetentionTightening(
  current: ThreadRetentionDays | null,
  next: ThreadRetentionDays | null,
): boolean {
  if (next === null) {
    return false;
  }
  return current === null || next < current;
}
