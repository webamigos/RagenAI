/**
 * Compute the start of the current monthly billing period for a subscription
 * anchored at `periodStart`. The anchor is the most recent date ≤ `now` that
 * lands on the subscription's monthly day-of-month boundary.
 *
 * Examples (periodStart=2026-01-15):
 *   now=2026-01-20 → 2026-01-15
 *   now=2026-02-14 → 2026-01-15  (still in first period)
 *   now=2026-02-15 → 2026-02-15  (boundary day)
 *   now=2026-03-01 → 2026-02-15
 *
 * Month-end edge case: if periodStart is on day 31 and the next month has
 * fewer days, the anchor clamps to the last day of that month. Standard JS
 * Date math handles this correctly via setUTCMonth overflow semantics — we
 * undo the overflow by checking the resulting day.
 */
export function currentPeriodAnchor(periodStart: Date, now: Date): Date {
  if (now.getTime() < periodStart.getTime()) {
    return periodStart;
  }

  const startD = periodStart.getUTCDate();
  const nowY = now.getUTCFullYear();
  const nowM = now.getUTCMonth();

  // Tentative anchor: same month as `now`, with the start day-of-month.
  let candidate = buildAnchor(nowY, nowM, startD, periodStart);

  // If `now` is before this month's boundary, the active period started
  // the previous month.
  if (candidate.getTime() > now.getTime()) {
    const prevM = nowM === 0 ? 11 : nowM - 1;
    const prevY = nowM === 0 ? nowY - 1 : nowY;
    candidate = buildAnchor(prevY, prevM, startD, periodStart);
  }

  // Never return an anchor before the subscription's actual start.
  if (candidate.getTime() < periodStart.getTime()) {
    return periodStart;
  }
  return candidate;
}

/**
 * Construct a UTC date at the given year/month/day, preserving the time-of-day
 * from `periodStart`. Clamps day to the month's last day if the target month
 * is shorter (e.g. day=31 in February).
 */
function buildAnchor(
  year: number,
  month: number,
  day: number,
  periodStart: Date,
): Date {
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDayOfMonth);
  return new Date(
    Date.UTC(
      year,
      month,
      safeDay,
      periodStart.getUTCHours(),
      periodStart.getUTCMinutes(),
      periodStart.getUTCSeconds(),
      periodStart.getUTCMilliseconds(),
    ),
  );
}
