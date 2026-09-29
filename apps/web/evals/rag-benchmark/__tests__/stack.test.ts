import { describe, expect, it } from 'vitest';

import { describeRetrievalSettings } from '../lib/stack';

describe('describeRetrievalSettings', () => {
  it("reads the organization's switches, not the runner's environment", () => {
    const described = describeRetrievalSettings(
      { rerankingEnabled: false, multiQueryEnabled: false },
      { FEATURE_FLAG_RERANKING: '1', MULTI_QUERY_VARIANT_COUNT: '3' },
    );

    expect(described).toEqual({
      rerankingEnabled: 'off (organization setting)',
      multiQueryVariants: 'off (organization setting)',
    });
  });

  it('treats unset settings as the chain does: on', () => {
    const described = describeRetrievalSettings(
      { rerankingEnabled: null, multiQueryEnabled: null },
      {},
    );

    expect(described.multiQueryVariants).toBe(
      'on, 1 variant per turn (code constant)',
    );
    expect(described.rerankingEnabled).toContain('on for the organization');
  });

  it("labels the reranking flag as the runner's, because the server's is not visible", () => {
    const described = describeRetrievalSettings(null, {
      FEATURE_FLAG_RERANKING: '1',
    });

    expect(described.rerankingEnabled).toContain(
      "FEATURE_FLAG_RERANKING=1 in the runner's environment",
    );
  });

  it('never reads a variant count from the environment', () => {
    const described = describeRetrievalSettings(null, {
      MULTI_QUERY_VARIANT_COUNT: '5',
    });

    expect(described.multiQueryVariants).not.toContain('5');
  });
});
