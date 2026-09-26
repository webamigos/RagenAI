/**
 * Neutral at every score, like the list's `RagScoreBadge`: green, amber and
 * crimson are reserved for document and job state (panel rules 11, 16, 17),
 * and the bar's length already shows the value.
 */
export function ScoreBadge({ total }: { total: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-paper-200 dark:bg-paper-700">
        <div
          className="h-full rounded-full bg-muted-foreground transition-all"
          style={{ width: `${total}%` }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums text-foreground">
        {total}
        <span className="font-normal text-muted-foreground">/100</span>
      </span>
    </div>
  );
}
