interface DateFilterProps {
  days: number;
  baseUrl: string;
  extraParams?: Record<string, string | undefined>;
  options?: number[];
}

export function DateFilter({
  days,
  baseUrl,
  extraParams = {},
  options = [7, 30, 90],
}: DateFilterProps) {
  return (
    <div className="flex gap-2">
      {options.map((d) => {
        const params = new URLSearchParams();
        params.set('days', String(d));
        for (const [k, v] of Object.entries(extraParams)) {
          if (v && k !== 'days') {
            params.set(k, v);
          }
        }
        return (
          <a
            key={d}
            href={`${baseUrl}?${params.toString()}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              days === d
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-accent'
            }`}
          >
            {d}d
          </a>
        );
      })}
    </div>
  );
}
