import { describe, expect, it } from 'vitest';

import {
  DOCLING_STATUS_INTERVAL_MS,
  DOCLING_STATUS_TTL_SECONDS,
  readDoclingStatus,
} from '../docling-status';

const NOW = new Date('2026-09-28T09:20:00.000Z');
const status = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    up: false,
    since: '2026-09-28T09:15:00.000Z',
    checkedAt: '2026-09-28T09:19:40.000Z',
    ...overrides,
  });

describe('readDoclingStatus', () => {
  it('reads what the worker publishes', () => {
    expect(readDoclingStatus(status(), NOW)).toEqual({
      up: false,
      since: '2026-09-28T09:15:00.000Z',
      checkedAt: '2026-09-28T09:19:40.000Z',
    });
  });

  // "Unknown" must never be shown as "up".
  it.each([
    ['nothing published', null],
    ['an empty value', ''],
    ['not JSON', 'down'],
    ['a JSON scalar', 'true'],
    ['a missing field', JSON.stringify({ up: true, since: 'x' })],
    ['a wrong type', status({ up: 'yes' })],
    ['an unparseable time', status({ checkedAt: 'soon' })],
    [
      'a status older than its TTL',
      status({ checkedAt: '2026-09-28T09:18:00.000Z' }),
    ],
  ])('is null for %s', (_, raw) => {
    expect(readDoclingStatus(raw, NOW)).toBeNull();
  });

  it('outlives one missed probe, but not a stopped worker', () => {
    expect(DOCLING_STATUS_TTL_SECONDS * 1000).toBeGreaterThanOrEqual(
      2 * DOCLING_STATUS_INTERVAL_MS,
    );
  });
});
