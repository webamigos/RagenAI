import Link from 'next/link';

/**
 * A single dashboard summary card. `value` is a pre-formatted string, not a
 * number — callers already know whether it's a plain count, a currency
 * amount, or a byte size, and formatting that here would mean either a union
 * of format options or losing the specific formatting each metric needs.
 */
export function StatTile({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: string;
  href?: string;
  tone?: 'warn';
}) {
  const content = (
    <div className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-foreground/30">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={`mt-2 text-3xl font-bold ${
          tone === 'warn' ? 'text-destructive' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}
