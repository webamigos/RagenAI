/** A pages-tab link that keeps the title search (`q`). */
export function withSearch(href: string, search: string | null): string {
  if (!search) {
    return href;
  }
  const [path, query = ''] = href.split('?');
  const params = new URLSearchParams(query);
  params.set('q', search);
  return `${path}?${params.toString()}`;
}
