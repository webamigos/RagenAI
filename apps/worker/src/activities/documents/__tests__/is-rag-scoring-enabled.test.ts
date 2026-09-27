import { beforeEach, describe, expect, it, vi } from 'vitest';

const brainDb = vi.hoisted(() => ({
  getFeatureLayers: vi.fn(),
  getPlanFeatures: vi.fn(),
}));
vi.mock('../../../services/db/brain.js', () => brainDb);

import { isRagScoringEnabled } from '../is-rag-scoring-enabled.js';

const layers = (
  overrides: Partial<{
    orgOverrides: unknown;
    platformDefaultsJson: string | null;
  }> = {},
) => ({
  orgOverrides: null,
  subscriptions: [],
  platformDefaultsJson: null,
  ...overrides,
});

describe('isRagScoringEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    brainDb.getPlanFeatures.mockResolvedValue(null);
  });

  it('is on when nothing is configured', async () => {
    brainDb.getFeatureLayers.mockResolvedValue(layers());
    await expect(isRagScoringEnabled({ orgId: 'org-1' })).resolves.toBe(true);
    expect(brainDb.getFeatureLayers).toHaveBeenCalledWith('org-1');
  });

  it('is off when the platform default turns it off', async () => {
    brainDb.getFeatureLayers.mockResolvedValue(
      layers({
        platformDefaultsJson: JSON.stringify({ ragReadinessScore: false }),
      }),
    );
    await expect(isRagScoringEnabled({ orgId: 'org-1' })).resolves.toBe(false);
  });

  it('lets an organization override beat the platform default', async () => {
    brainDb.getFeatureLayers.mockResolvedValue(
      layers({
        orgOverrides: { ragReadinessScore: true },
        platformDefaultsJson: JSON.stringify({ ragReadinessScore: false }),
      }),
    );
    await expect(isRagScoringEnabled({ orgId: 'org-1' })).resolves.toBe(true);
  });

  // D1: upload does not score unless an operator opts in.
  it('does not score on ingest by default', async () => {
    brainDb.getFeatureLayers.mockResolvedValue(layers());
    await expect(
      isRagScoringEnabled({ orgId: 'org-1', stage: 'ingest' }),
    ).resolves.toBe(false);
  });

  it('scores on ingest when the organization opts in', async () => {
    brainDb.getFeatureLayers.mockResolvedValue(
      layers({ orgOverrides: { ragScoreOnIngest: true } }),
    );
    await expect(
      isRagScoringEnabled({ orgId: 'org-1', stage: 'ingest' }),
    ).resolves.toBe(true);
  });

  // It narrows the main key, never widens it.
  it('does not score on ingest when scoring is off, whatever the ingest key says', async () => {
    brainDb.getFeatureLayers.mockResolvedValue(
      layers({
        orgOverrides: { ragScoreOnIngest: true, ragReadinessScore: false },
      }),
    );
    await expect(
      isRagScoringEnabled({ orgId: 'org-1', stage: 'ingest' }),
    ).resolves.toBe(false);
  });
});
