import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * One chip per value, as links: a filter is part of the URL, so a filtered
 * list can be shared and reloaded. `docs/panel-ux-rules.md` rule 13 — the
 * chip shows its value, and the active one says so without relying on colour
 * alone (`aria-current`, and a border).
 */
export function FilterChips({
  label,
  options,
}: {
  label: string;
  options: {
    key: string;
    label: string;
    href: string;
    active: boolean;
    /** How many rows this value holds; shown after the label when given. */
    count?: number;
  }[];
}) {
  return (
    <nav aria-label={label} className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}:</span>
      {options.map((option) => (
        <Link
          key={option.key}
          href={option.href}
          aria-current={option.active ? 'page' : undefined}
          className={cn(
            'inline-flex h-7 items-center rounded-[6px] border px-2.5 text-xs',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            option.active
              ? 'border-foreground bg-accent font-medium text-foreground'
              : 'border-border text-muted-foreground hover:bg-accent',
          )}
        >
          {option.label}
          {option.count !== undefined && (
            <span className="tabular-nums text-muted-foreground">
              {` (${option.count})`}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
