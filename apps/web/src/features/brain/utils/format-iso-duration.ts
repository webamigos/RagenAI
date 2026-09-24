/**
 * An ISO 8601 duration ("P6M", "P1Y2M", "P2W", "PT12H") in words, in the
 * reader's language: "6 miesięcy", "1 year, 2 months".
 *
 * `KnowledgePage.verifyEvery` is stored in this form and the page view printed
 * it raw — "Verification interval: P6M" on every locale. Each part goes
 * through `Intl.NumberFormat`'s unit style, which carries the plural rules
 * (1 miesiąc, 2 miesiące, 6 miesięcy) in every engine we support; the parts
 * are joined with `Intl.ListFormat`. `Intl.DurationFormat` would do both, but
 * it is newer than the browsers this panel still serves.
 *
 * A string that is not a duration, or one with no non-zero part, comes back
 * unchanged: showing the stored value is better than showing nothing.
 */
const PATTERN =
  /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

const UNITS = [
  'year',
  'month',
  'week',
  'day',
  'hour',
  'minute',
  'second',
] as const;

export function formatIsoDuration(iso: string, locale: string): string {
  const match = PATTERN.exec(iso.trim());
  if (!match) {
    return iso;
  }
  const parts = UNITS.flatMap((unit, i) => {
    const value = Number(match[i + 1] ?? 0);
    return value > 0
      ? [
          new Intl.NumberFormat(locale, {
            style: 'unit',
            unit,
            unitDisplay: 'long',
          }).format(value),
        ]
      : [];
  });
  if (parts.length === 0) {
    return iso;
  }
  return new Intl.ListFormat(locale, {
    style: 'long',
    type: 'unit',
  }).format(parts);
}
