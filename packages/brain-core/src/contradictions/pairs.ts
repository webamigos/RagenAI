import { slugify } from '../text';

export type ContradictionPageInput = {
  id: number;
  title: string;
  /** Files the page's sources cite. */
  fileIds: ReadonlyArray<string>;
};

/**
 * Which pages to compare (spec C1): two pages about **the same subject**,
 * built from **different evidence**, at least one of them new.
 *
 * - *The same subject* is the same title once normalised — `slugify`, the key
 *   extraction already merges entities on within a document. Across
 *   documents that is where a second document's page on the same thing lands
 *   (as a suffixed slug beside the first), so it is exactly the pair a
 *   contradiction lives in. Two titles for one subject ("Urlop" and "Urlop
 *   wypoczynkowy") are missed; matching them needs entity resolution, which
 *   is the review queue's merge, not a guess made here.
 * - *Different evidence*: two pages citing exactly the same files are a
 *   re-extraction of one document beside itself, and comparing them pays a
 *   model to find nothing.
 * - *At least one new*: `touched` names the pages this run wrote. A pair of
 *   old pages was judged when the second of them was written, and asking
 *   again would bill every run for every pair ever seen.
 *
 * Pairs come out ordered, smaller id first, and each once.
 */
export function contradictionPairs(
  pages: ReadonlyArray<ContradictionPageInput>,
  touched: ReadonlySet<number>,
): [number, number][] {
  const bySubject = new Map<string, ContradictionPageInput[]>();
  for (const page of pages) {
    const key = slugify(page.title);
    const group = bySubject.get(key) ?? [];
    group.push(page);
    bySubject.set(key, group);
  }
  const pairs: [number, number][] = [];
  for (const group of bySubject.values()) {
    const sorted = [...group].sort((a, b) => a.id - b.id);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        if (!touched.has(a.id) && !touched.has(b.id)) {
          continue;
        }
        if (sameFiles(a.fileIds, b.fileIds)) {
          continue;
        }
        pairs.push([a.id, b.id]);
      }
    }
  }
  return pairs.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}

function sameFiles(a: ReadonlyArray<string>, b: ReadonlyArray<string>) {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}
