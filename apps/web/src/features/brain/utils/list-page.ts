import { BRAIN_LIST_LIMIT } from '../constants';

/**
 * The batch a Brain list is showing, from `?page=`: a whole number from 1.
 * Anything else — absent, `0`, `-3`, `2.5`, `abc`, a repeated parameter —
 * is the first batch, so a hand-edited URL shows a list rather than an error.
 */
export function parseListPage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{1,6}$/.test(value)) {
    return 1;
  }
  return Math.max(1, Number(value));
}

/** Rows to skip for a batch — the query's side of `parseListPage`. */
export function listSkip(page: number): number {
  return (Math.max(1, page) - 1) * BRAIN_LIST_LIMIT;
}

/** The 1-based range of rows a batch shows, for "Pages: 201–400 of 450". */
export function listRange(page: number, shown: number): string {
  if (shown === 0) {
    return '0';
  }
  const from = listSkip(page) + 1;
  return `${from}–${from + shown - 1}`;
}
