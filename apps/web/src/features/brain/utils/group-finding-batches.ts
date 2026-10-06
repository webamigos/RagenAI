import type { KnowledgeFindingListItem } from '../contracts/brain.types';

export type FindingBatch = {
  items: KnowledgeFindingListItem[];
  from: string;
  to: string;
};
/** Groups only consecutive history rows in the current list page. */
export function groupFindingBatches(
  items: readonly KnowledgeFindingListItem[],
): FindingBatch[] {
  const batches: FindingBatch[] = [];
  for (const item of items) {
    const previous = batches.at(-1);
    const last = previous?.items.at(-1);
    const time = Date.parse(item.detectedAt);
    if (
      previous &&
      last &&
      item.status !== 'OPEN' &&
      last.status === item.status &&
      last.type === item.type &&
      Math.abs(time - Date.parse(last.detectedAt)) <= 5 * 60_000
    ) {
      previous.items.push(item);
      if (time < Date.parse(previous.from)) {
        previous.from = item.detectedAt;
      }
      if (time > Date.parse(previous.to)) {
        previous.to = item.detectedAt;
      }
    } else {
      batches.push({
        items: [item],
        from: item.detectedAt,
        to: item.detectedAt,
      });
    }
  }
  return batches;
}
