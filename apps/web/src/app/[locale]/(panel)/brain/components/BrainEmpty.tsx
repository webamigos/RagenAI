/**
 * A compact block at the top of the list, not a centred hero —
 * `docs/panel-ux-rules.md` rules 5 and 20: what this list is for, in two
 * lines.
 */
export function BrainEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      data-testid="brain-empty"
      className="rounded-[6px] border border-border bg-background p-4"
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
    </div>
  );
}
