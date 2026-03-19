interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  baseUrl: string;
  extraParams?: Record<string, string | undefined>;
}

export function Pagination({
  page,
  totalPages,
  total,
  baseUrl,
  extraParams = {},
}: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    params.set('page', String(p));
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) {
        params.set(k, v);
      }
    }
    return `${baseUrl}?${params.toString()}`;
  };

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages} ({total.toLocaleString()} total)
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <a
            href={buildHref(page - 1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            Previous
          </a>
        )}
        {page < totalPages && (
          <a
            href={buildHref(page + 1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            Next
          </a>
        )}
      </div>
    </div>
  );
}
