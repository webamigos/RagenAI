/* eslint-disable no-var */
var mockDeleteExpiredDocumentRetrievals: jest.Mock;
var mockRetentionDays: number;
/* eslint-enable no-var */

jest.mock('../../../services/db', () => ({
  db: {
    deleteExpiredDocumentRetrievals: (...args: unknown[]) =>
      mockDeleteExpiredDocumentRetrievals(...args),
  },
}));

jest.mock('../../../services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../consts', () => ({
  get ANALYTICS_RETENTION_DAYS() {
    return mockRetentionDays;
  },
}));

import { pruneDocumentRetrievals } from '../prune-document-retrievals';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('pruneDocumentRetrievals', () => {
  beforeEach(() => {
    mockDeleteExpiredDocumentRetrievals = jest
      .fn()
      .mockResolvedValue({ organizationsScanned: 3, retrievalsDeleted: 12 });
    mockRetentionDays = 90;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('cuts at the retention boundary', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-01T03:30:00Z'));

    await pruneDocumentRetrievals();

    const [olderThan] = mockDeleteExpiredDocumentRetrievals.mock.calls[0] as [
      Date,
    ];
    expect(olderThan).toEqual(new Date('2026-03-03T03:30:00Z'));
  });

  it('honours a shorter configured window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-01T03:30:00Z'));
    mockRetentionDays = 7;

    await pruneDocumentRetrievals();

    const [olderThan] = mockDeleteExpiredDocumentRetrievals.mock.calls[0] as [
      Date,
    ];
    expect(olderThan).toEqual(new Date('2026-05-25T03:30:00Z'));
  });

  it('reports what it deleted, and from how many organizations', async () => {
    const result = await pruneDocumentRetrievals();

    expect(result.organizationsScanned).toBe(3);
    expect(result.retrievalsDeleted).toBe(12);
    expect(result.olderThan).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('is idempotent — a second run deletes nothing and does not fail', async () => {
    await pruneDocumentRetrievals();

    mockDeleteExpiredDocumentRetrievals.mockResolvedValueOnce({
      organizationsScanned: 3,
      retrievalsDeleted: 0,
    });
    const second = await pruneDocumentRetrievals();

    expect(second.retrievalsDeleted).toBe(0);
  });

  /**
   * The cutoff comes from the clock, not from a cursor, which is the reason a
   * failed run needs no alerting: the next night simply covers a wider window.
   * A cursor would make a missed run permanent.
   */
  it('recovers a missed night without being told one was missed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-01T03:30:00Z'));
    await pruneDocumentRetrievals();
    const [firstCutoff] = mockDeleteExpiredDocumentRetrievals.mock.calls[0] as [
      Date,
    ];

    jest.setSystemTime(new Date('2026-06-03T03:30:00Z'));
    await pruneDocumentRetrievals();
    const [laterCutoff] = mockDeleteExpiredDocumentRetrievals.mock.calls[1] as [
      Date,
    ];

    expect(laterCutoff.getTime() - firstCutoff.getTime()).toBe(2 * DAY_MS);
  });
});
