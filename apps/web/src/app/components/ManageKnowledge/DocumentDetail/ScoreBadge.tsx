function scoreColor(total: number): { text: string; bar: string } {
  if (total >= 75) {
    return { text: 'text-ready', bar: 'bg-ready' };
  }
  if (total >= 50) {
    return { text: 'text-pending', bar: 'bg-pending' };
  }
  return { text: 'text-destructive', bar: 'bg-destructive' };
}

export function ScoreBadge({ total }: { total: number }) {
  const { text, bar } = scoreColor(total);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-paper-200 dark:bg-paper-700">
        <div
          className={`h-full rounded-full transition-all ${bar}`}
          style={{ width: `${total}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${text}`}>
        {total}
        <span className="font-normal text-muted-foreground">/100</span>
      </span>
    </div>
  );
}
