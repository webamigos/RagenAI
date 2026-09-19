/**
 * Locale formatting, kept in one place so the two corpora quote the same
 * figures.
 *
 * Both locales render the same digits in the same order — 1 480,00 zł against
 * PLN 1,480.00 — which is what lets the corpus test compare a Polish document
 * with its English twin by stripping everything that is not a digit. The RAG
 * benchmark's grader compares figures the same way across locales.
 */

const GROUP = { pl: ' ', en: ',' };
const DECIMAL = { pl: ',', en: '.' };

function group(digits, separator) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/** A plain number: 27 300 000 / 27,300,000. */
export function number(value, locale, decimals = 0) {
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole, fraction] = fixed.split('.');
  const body = group(whole, GROUP[locale]) + (fraction ? DECIMAL[locale] + fraction : '');
  return (value < 0 ? '-' : '') + body;
}

/**
 * Money. Polish puts the unit after the amount, English before it — the
 * convention each reader expects, and the digits are untouched either way.
 */
export function money(value, locale, decimals = 0) {
  const amount = number(value, locale, decimals);
  return locale === 'pl' ? `${amount} zł` : `PLN ${amount}`;
}

/** A percentage written from a fraction: 0.142 → 14,2% / 14.2%. */
export function percent(value, locale, decimals = 1) {
  return `${number(value * 100, locale, decimals)}%`;
}

/** A figure already expressed in percent: 15.4 → 15,4% / 15.4%. */
export function percentPoints(value, locale, decimals = 1) {
  return `${number(value, locale, decimals)}%`;
}

/** Millions, as the annual report writes them. */
export function millions(value, locale) {
  const amount = number(value / 1_000_000, locale, 1);
  return locale === 'pl' ? `${amount} mln zł` : `PLN ${amount} million`;
}

/**
 * A count of months. Polish picks the plural form from the number — 12
 * miesięcy, 24 miesiące — and getting it wrong is the kind of detail a native
 * reader notices immediately in a document meant to look real.
 */
export function months(count, locale) {
  if (locale === 'en') {
    return `${count} months`;
  }
  const lastTwo = count % 100;
  const last = count % 10;
  const few = last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14);
  return `${count} ${few ? 'miesiące' : 'miesięcy'}`;
}

/** Working days, as the catalogue and the price list write them. */
export function workingDays(count, locale) {
  return locale === 'pl' ? `${count} dni roboczych` : `${count} working days`;
}

/** Pick one side of a `t(pl, en)` label, and pass a plain string through. */
export function pick(label, locale) {
  return label && typeof label === 'object' && locale in label ? label[locale] : label;
}
