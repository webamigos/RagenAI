import { beforeEach, describe, expect, it, vi } from 'vitest';

const brainDb = vi.hoisted(() => ({
  getFeatureLayers: vi.fn(),
  getPlanFeatures: vi.fn(),
}));
vi.mock('../../../services/db/brain.js', () => brainDb);

import { startBrainExtractRun } from '../start-brain-extract-run.js';

const layers = (over: Partial<Record<string, unknown>> = {}) => ({
  orgOverrides: null,
  subscriptions: [],
  platformDefaultsJson: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  brainDb.getPlanFeatures.mockResolvedValue(null);
});

describe('startBrainExtractRun', () => {
  it('is off by default — the code default', async () => {
    brainDb.getFeatureLayers.mockResolvedValue(layers());
    expect((await startBrainExtractRun({ orgId: 'o' })).enabled).toBe(false);
  });

  it('is on when the organization override says so', async () => {
    brainDb.getFeatureLayers.mockResolvedValue(
      layers({ orgOverrides: { brain: true } }),
    );
    expect((await startBrainExtractRun({ orgId: 'o' })).enabled).toBe(true);
  });

  it('lets an explicit organization false beat a plan true', async () => {
    brainDb.getFeatureLayers.mockResolvedValue(
      layers({
        orgOverrides: { brain: false },
        subscriptions: [
          { plan: 'Business', status: 'active', periodStart: null },
        ],
      }),
    );
    brainDb.getPlanFeatures.mockResolvedValue({ brain: true });
    expect((await startBrainExtractRun({ orgId: 'o' })).enabled).toBe(false);
  });

  it('reads the plan of an active subscription', async () => {
    brainDb.getFeatureLayers.mockResolvedValue(
      layers({
        subscriptions: [
          { plan: 'Business', status: 'active', periodStart: null },
        ],
      }),
    );
    brainDb.getPlanFeatures.mockResolvedValue({ brain: true });
    expect((await startBrainExtractRun({ orgId: 'o' })).enabled).toBe(true);
    expect(brainDb.getPlanFeatures).toHaveBeenCalledWith('Business');
  });

  it('ignores the plan of a canceled subscription', async () => {
    brainDb.getFeatureLayers.mockResolvedValue(
      layers({
        subscriptions: [
          { plan: 'Business', status: 'canceled', periodStart: null },
        ],
      }),
    );
    expect((await startBrainExtractRun({ orgId: 'o' })).enabled).toBe(false);
    expect(brainDb.getPlanFeatures).not.toHaveBeenCalled();
  });

  it('reads the platform default', async () => {
    brainDb.getFeatureLayers.mockResolvedValue(
      layers({ platformDefaultsJson: JSON.stringify({ brain: true }) }),
    );
    expect((await startBrainExtractRun({ orgId: 'o' })).enabled).toBe(true);
  });

  it('treats an unparseable platform row as inherit, which is off', async () => {
    brainDb.getFeatureLayers.mockResolvedValue(
      layers({ platformDefaultsJson: '{not json' }),
    );
    expect((await startBrainExtractRun({ orgId: 'o' })).enabled).toBe(false);
  });

  it('hands back the run ceilings', async () => {
    brainDb.getFeatureLayers.mockResolvedValue(layers());
    const run = await startBrainExtractRun({ orgId: 'o' });
    expect(run.maxDocuments).toBeGreaterThan(0);
    expect(run.maxTokens).toBeGreaterThan(0);
  });
});
