import { describe, it, expect } from 'vitest';
import { ragScoreSchema } from '../rag-score.types';

const validScore = {
  chunkStructure: 8,
  avgChunkSize: 7,
  entityDensity: 9,
  selfContainedness: 6,
  qaAdherence: 8,
  total: 77,
  suggestions: ['Add contact info per section'],
};

describe('ragScoreSchema', () => {
  it('accepts a valid score object', () => {
    const result = ragScoreSchema.safeParse(validScore);
    expect(result.success).toBe(true);
  });

  it('accepts boundary values (all zeros)', () => {
    const result = ragScoreSchema.safeParse({
      chunkStructure: 0,
      avgChunkSize: 0,
      entityDensity: 0,
      selfContainedness: 0,
      qaAdherence: 0,
      total: 0,
      suggestions: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts boundary values (all maxes)', () => {
    const result = ragScoreSchema.safeParse({
      chunkStructure: 10,
      avgChunkSize: 10,
      entityDensity: 10,
      selfContainedness: 10,
      qaAdherence: 10,
      total: 100,
      suggestions: ['a', 'b', 'c', 'd', 'e'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects chunkStructure > 10', () => {
    const result = ragScoreSchema.safeParse({
      ...validScore,
      chunkStructure: 11,
    });
    expect(result.success).toBe(false);
  });

  it('rejects chunkStructure < 0', () => {
    const result = ragScoreSchema.safeParse({
      ...validScore,
      chunkStructure: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects total > 100', () => {
    const result = ragScoreSchema.safeParse({
      ...validScore,
      total: 101,
    });
    expect(result.success).toBe(false);
  });

  it('rejects suggestions array > 5 items', () => {
    const result = ragScoreSchema.safeParse({
      ...validScore,
      suggestions: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects suggestion string > 300 chars', () => {
    const result = ragScoreSchema.safeParse({
      ...validScore,
      suggestions: ['x'.repeat(301)],
    });
    expect(result.success).toBe(false);
  });

  it('rejects payload with multiple invalid fields', () => {
    const result = ragScoreSchema.safeParse({
      chunkStructure: -5,
      avgChunkSize: 15,
      entityDensity: 9,
      selfContainedness: 6,
      qaAdherence: 8,
      total: 200,
      suggestions: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(3);
    }
  });
});
