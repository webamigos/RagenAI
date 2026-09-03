import { Download } from 'lucide-react';

/**
 * Link, not a button: the export is a GET the browser downloads, so there is
 * nothing to hydrate and no client component needed.
 *
 * `extraParams` carries the page's current filters, so the file matches what
 * the reader is looking at rather than the whole table.
 */
export function ExportButton({
  dataset,
  extraParams = {},
}: {
  dataset:
    'activity-log' | 'ai-usage' | 'incidents' | 'disk-usage' | 'api-keys';
  extraParams?: Record<string, string | undefined>;
}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(extraParams)) {
    if (value) {
      search.set(key, value);
    }
  }
  const query = search.toString();

  return (
    <a
      href={`/api/export/${dataset}${query ? `?${query}` : ''}`}
      className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
      // Downloads leave the SPA; let the browser handle it.
      download
    >
      <Download className="h-4 w-4" />
      Export CSV
    </a>
  );
}
