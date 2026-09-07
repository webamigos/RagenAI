/* eslint-disable no-var */
var mockDeleteStaleThreads: jest.Mock;
var mockDemoOrganizationId: string | undefined;
/* eslint-enable no-var */

jest.mock('../../../services/db', () => ({
  db: {
    deleteStaleThreads: (...args: unknown[]) => mockDeleteStaleThreads(...args),
  },
}));

jest.mock('../../../services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../consts', () => ({
  get DEMO_ORGANIZATION_ID() {
    return mockDemoOrganizationId;
  },
  DEMO_THREAD_RETENTION_HOURS: 24,
}));

import { deleteStaleDemoThreads } from '../delete-stale-demo-threads';

describe('deleteStaleDemoThreads', () => {
  beforeEach(() => {
    mockDeleteStaleThreads = jest
      .fn()
      .mockResolvedValue({ threadsDeleted: 2, messagesDeleted: 7 });
    mockDemoOrganizationId = 'org-demo';
  });

  it('deletes for the configured organization', async () => {
    const result = await deleteStaleDemoThreads();

    expect(result).toEqual({
      skipped: false,
      threadsDeleted: 2,
      messagesDeleted: 7,
    });
    expect(mockDeleteStaleThreads).toHaveBeenCalledTimes(1);
    expect(mockDeleteStaleThreads.mock.calls[0][0]).toBe('org-demo');
  });

  it('does nothing when no demo organization is configured', async () => {
    // The safety property, not a convenience: a scheduled delete must not
    // acquire a target because a variable was forgotten.
    mockDemoOrganizationId = undefined;

    const result = await deleteStaleDemoThreads();

    expect(result).toEqual({
      skipped: true,
      threadsDeleted: 0,
      messagesDeleted: 0,
    });
    expect(mockDeleteStaleThreads).not.toHaveBeenCalled();
  });

  it('passes a cutoff one retention window in the past, not "now"', async () => {
    const before = Date.now();
    await deleteStaleDemoThreads();
    const after = Date.now();

    const cutoff = mockDeleteStaleThreads.mock.calls[0][1] as Date;
    const windowMs = 24 * 60 * 60 * 1000;

    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - windowMs);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - windowMs);
  });
});
