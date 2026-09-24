import { isoDurationSchema } from '@ragenai/brain-contracts';

/**
 * `verifyEvery` added to a date, in calendar terms and in UTC.
 *
 * Calendar, not a fixed number of milliseconds: `P1M` from 31 January is the
 * end of February, not 3 March, and `P1Y` is a year whatever it contains. The
 * day is clamped to the target month rather than rolled over, which is what a
 * person setting "verify monthly" means.
 *
 * Returns null for a value that is not an ISO-8601 duration. The column is a
 * plain string, and a value nobody can interpret must not become a date that
 * silently never — or always — comes due.
 */
export function addIsoDuration(from: Date, duration: string): Date | null {
  if (!isoDurationSchema.safeParse(duration).success) {
    return null;
  }
  const match =
    /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
      duration,
    );
  if (!match) {
    return null;
  }
  const [years, months, weeks, days, hours, minutes, seconds] = match
    .slice(1)
    .map((part) => (part === undefined ? 0 : Number(part)));

  const totalMonths = from.getUTCMonth() + years * 12 + months;
  const year = from.getUTCFullYear() + Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const shifted = new Date(
    Date.UTC(
      year,
      month,
      Math.min(from.getUTCDate(), lastDay),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
  const extraMs =
    ((weeks * 7 + days) * 24 * 3600 + hours * 3600 + minutes * 60 + seconds) *
    1000;
  return new Date(shifted.getTime() + extraMs);
}
