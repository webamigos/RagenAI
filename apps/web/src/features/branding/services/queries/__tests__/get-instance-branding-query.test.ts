import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.hoisted(() => vi.fn());
const featureEnabled = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());

vi.mock('@ragenai/prisma-client', () => ({
  default: { instanceBranding: { findUnique } },
}));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isInstanceFeatureEnabledQuery: featureEnabled }),
);
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  clearInstanceBrandingCache,
  getInstanceBrandingQuery,
} from '../get-instance-branding-query';
import { DEFAULT_INSTANCE_BRANDING } from '../../../contracts/branding.types';

const ROW = {
  productName: 'Acme Knowledge',
  logoStorageKey: 'instance-branding/logo-1.png',
  primaryToken: 'violet',
  updatedAt: new Date('2026-10-19T10:00:00Z'),
};

describe('getInstanceBrandingQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    clearInstanceBrandingCache();
    delete process.env.NEXT_PHASE;
    featureEnabled.mockResolvedValue(true);
    findUnique.mockResolvedValue(ROW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is the default, and does not read the row, while the feature key is off', async () => {
    featureEnabled.mockResolvedValue(false);

    await expect(getInstanceBrandingQuery()).resolves.toEqual(
      DEFAULT_INSTANCE_BRANDING,
    );
    expect(featureEnabled).toHaveBeenCalledWith('instanceBranding');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('is the default when the key is on and there is no row', async () => {
    findUnique.mockResolvedValue(null);

    await expect(getInstanceBrandingQuery()).resolves.toEqual(
      DEFAULT_INSTANCE_BRANDING,
    );
  });

  it('reads the single row and resolves it', async () => {
    await expect(getInstanceBrandingQuery()).resolves.toEqual({
      productName: 'Acme Knowledge',
      logoUrl: `/api/branding/logo?v=${ROW.updatedAt.getTime()}`,
      palette: 'violet',
      isCustom: true,
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    );
  });

  it('answers from memory inside the window, so a panel render costs no query', async () => {
    await getInstanceBrandingQuery();
    await getInstanceBrandingQuery();
    await getInstanceBrandingQuery();

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(featureEnabled).toHaveBeenCalledTimes(1);
  });

  it('reads again once the window has passed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
    await getInstanceBrandingQuery();

    vi.setSystemTime(new Date('2026-10-19T12:01:01Z'));
    await getInstanceBrandingQuery();

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('reads again at once after the cache is cleared, which is what a save does', async () => {
    await getInstanceBrandingQuery();
    findUnique.mockResolvedValue({ ...ROW, productName: 'Globex' });

    clearInstanceBrandingCache();

    expect((await getInstanceBrandingQuery()).productName).toBe('Globex');
  });

  it('shares one cache across module copies, so a save clears what the panel reads', async () => {
    // Next bundles route handlers and server components separately: the
    // save's copy of this module is not the panel's.
    await getInstanceBrandingQuery();
    vi.resetModules();
    const other = await import('../get-instance-branding-query');
    findUnique.mockResolvedValue({ ...ROW, productName: 'Globex' });

    other.clearInstanceBrandingCache();

    expect((await getInstanceBrandingQuery()).productName).toBe('Globex');
  });

  it('falls back to the default when the read fails, and says so', async () => {
    featureEnabled.mockRejectedValue(new Error('connection refused'));

    await expect(getInstanceBrandingQuery()).resolves.toEqual(
      DEFAULT_INSTANCE_BRANDING,
    );
    expect(warn).toHaveBeenCalled();
  });

  it('keeps the last good answer through a failed read', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
    await getInstanceBrandingQuery();

    vi.setSystemTime(new Date('2026-10-19T12:05:00Z'));
    findUnique.mockRejectedValue(new Error('connection refused'));

    expect((await getInstanceBrandingQuery()).productName).toBe(
      'Acme Knowledge',
    );
  });

  it('touches no database while next build collects page data', async () => {
    process.env.NEXT_PHASE = 'phase-production-build';

    await expect(getInstanceBrandingQuery()).resolves.toEqual(
      DEFAULT_INSTANCE_BRANDING,
    );
    expect(featureEnabled).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
