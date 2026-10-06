import { expect, it } from 'vitest';
import { groupFindingBatches } from '../utils/group-finding-batches';
import type { KnowledgeFindingListItem } from '../contracts/brain.types';
const item = (
  publicId: string,
  type: KnowledgeFindingListItem['type'],
  minute: number,
  status: KnowledgeFindingListItem['status'] = 'RESOLVED',
): KnowledgeFindingListItem => ({
  publicId,
  type,
  status,
  severity: 'LOW',
  detectedAt: new Date(Date.UTC(2026, 9, 6, 12, minute)).toISOString(),
  pages: [],
  file: null,
  summary: { kind: 'unknown' },
});
it('groups consecutive closed findings of the same type within five minutes', () => {
  const rows = [
    item('a', 'EXTRACTION_FAILED', 8),
    item('b', 'EXTRACTION_FAILED', 4),
    item('c', 'EXTRACTION_FAILED', 3),
  ];
  expect(
    groupFindingBatches(rows).map((b) => b.items.map((i) => i.publicId)),
  ).toEqual([['a', 'b', 'c']]);
});
it('separates types, statuses, open findings and gaps; never changes the input order', () => {
  const rows = [
    item('a', 'ORPHAN', 20),
    item('b', 'ORPHAN', 14),
    item('c', 'STALE', 13),
    item('d', 'ORPHAN', 12),
    item('e', 'ORPHAN', 11, 'DISMISSED'),
    item('f', 'ORPHAN', 10, 'OPEN'),
    item('g', 'ORPHAN', 9, 'OPEN'),
  ];
  expect(groupFindingBatches(rows).map((b) => b.items.length)).toEqual([
    1, 1, 1, 1, 1, 1, 1,
  ]);
  expect(rows.map((i) => i.publicId)).toEqual([
    'a',
    'b',
    'c',
    'd',
    'e',
    'f',
    'g',
  ]);
});
it('returns no groups for no findings', () => {
  expect(groupFindingBatches([])).toEqual([]);
});
