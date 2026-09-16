/**
 * The timezone both nightly schedules fire in.
 *
 * **This changes when they run, and deliberately.** The Temporal schedules
 * these replace set `cronExpressions` with no timezone, which Temporal reads as
 * UTC — so "03:00 daily", described in both scripts as quiet hours in
 * Europe/Warsaw, has actually been firing at 04:00 or 05:00 local depending on
 * the season. The seam requires a timezone rather than letting one be implied,
 * which is what surfaced the gap.
 *
 * Europe/Warsaw is the repository's default timezone (`Timestamptz`, default TZ
 * in the schema) and the intent both scripts already documented, so the fix is
 * to say it rather than to re-document the drift. Harmless for a nightly
 * cleanup; worth knowing before wondering why a run moved an hour.
 */
export const SCHEDULE_TIMEZONE = 'Europe/Warsaw';
