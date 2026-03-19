export function formatRelativeTime(
  date: string | Date,
  locale: string,
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diffSec < 60) {
    return rtf.format(-diffSec, 'second');
  }
  const diffMins = Math.floor(diffSec / 60);
  if (diffMins < 60) {
    return rtf.format(-diffMins, 'minute');
  }
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return rtf.format(-diffHours, 'hour');
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return rtf.format(-diffDays, 'day');
  }
  return d.toLocaleDateString(locale);
}
