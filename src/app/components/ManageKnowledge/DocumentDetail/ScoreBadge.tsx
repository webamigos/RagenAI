function scoreColor(total: number): { text: string; bar: string } {
  if (total >= 75) {
    return { text: 'text-green-600 dark:text-green-400', bar: 'bg-green-500' };
  }
  if (total >= 50) {
    return { text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-400' };
  }
  return { text: 'text-red-500 dark:text-red-400', bar: 'bg-red-500' };
}

export function ScoreBadge({ total }: { total: number }) {
  const { text, bar } = scoreColor(total);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className={`h-full rounded-full transition-all ${bar}`}
          style={{ width: `${total}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${text}`}>
        {total}
        <span className="font-normal text-zinc-400">/100</span>
      </span>
    </div>
  );
}
