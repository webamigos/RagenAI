import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const upsert = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    settings: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      upsert: (...args: unknown[]) => upsert(...args),
    },
  },
}));

const { isInstallClaimed, markInstallClaimed, backfillClaimIfAdminExists } =
  await import('../install-claim');

describe('install claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue(null);
    upsert.mockResolvedValue({});
  });

  it('reports an unclaimed install', async () => {
    await expect(isInstallClaimed()).resolves.toBe(false);
  });

  it('reports a claimed install', async () => {
    findUnique.mockResolvedValue({ key: 'initial_setup_claimed_at' });

    await expect(isInstallClaimed()).resolves.toBe(true);
  });

  it('never rewrites the date it was first claimed', async () => {
    // `update: {}` is the whole point. A second write would move the
    // timestamp without meaning anything by it, and the value is the one
    // piece of history this row carries.
    await markInstallClaimed();

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} }),
    );
  });

  describe('backfill for installs that predate the marker', () => {
    it('claims an install that already has an admin', async () => {
      // Without this, an install in daily use keeps no marker, and removing
      // its last admin would reopen the first-run screen.
      await backfillClaimIfAdminExists(true);

      expect(upsert).toHaveBeenCalledTimes(1);
    });

    it('leaves a genuinely fresh install alone', async () => {
      await backfillClaimIfAdminExists(false);

      expect(upsert).not.toHaveBeenCalled();
    });

    it('swallows a write failure rather than breaking sign-in', async () => {
      // It runs behind the status query on the unauthenticated sign-in page,
      // whose contract is to replace a stack trace with a readable report. A
      // failed backfill leaves the previous behaviour, which the caller
      // already handles.
      upsert.mockRejectedValue(new Error('read-only transaction'));

      await expect(backfillClaimIfAdminExists(true)).resolves.toBeUndefined();
    });
  });
});
