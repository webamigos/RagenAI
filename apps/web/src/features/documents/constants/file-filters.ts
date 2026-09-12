/**
 * The query parameters the file-list filter chips set, in one place.
 *
 * There are two "Reset filters" actions — one on the chip row, one in the
 * empty state the grid renders — and they live in different components with
 * different routers. They were two hand-written lists of the same names, so
 * adding the policy chip cleared it from one and left it in the other: the
 * grid's reset reloaded the identical empty result, because the filter that
 * emptied it was still in the URL.
 *
 * A filter added later needs this list and nothing else.
 */
export const FILE_FILTER_PARAMS = [
  'fileType',
  'embeddingStatus',
  'piiPolicy',
] as const;

/** Drops every filter and returns to the first page. Mutates `params`. */
export function clearFileFilterParams(params: URLSearchParams): void {
  for (const name of FILE_FILTER_PARAMS) {
    params.delete(name);
  }
  params.set('page', '1');
}
