import { describe, expect, it } from 'vitest';

import {
  pageDecisionInputSchema,
  setAccessInputSchema,
  setOwnerInputSchema,
} from '../contracts/brain-review.types';

const ref = {
  publicId: '11111111-2222-4333-8444-555555555555',
  expectedUpdatedAt: '2026-09-23T10:00:00.000Z',
};

describe('review input schemas', () => {
  it('accepts a page reference', () => {
    expect(pageDecisionInputSchema.safeParse(ref).success).toBe(true);
  });

  it.each([
    ['a non-uuid id', { ...ref, publicId: "' or 1=1" }],
    ['a missing timestamp', { publicId: ref.publicId }],
    ['a timestamp that is not ISO', { ...ref, expectedUpdatedAt: 'yesterday' }],
  ])('refuses %s', (_, input) => {
    expect(pageDecisionInputSchema.safeParse(input).success).toBe(false);
  });

  it('needs an owner id', () => {
    expect(
      setOwnerInputSchema.safeParse({ ...ref, ownerId: 'u1' }).success,
    ).toBe(true);
    expect(setOwnerInputSchema.safeParse({ ...ref, ownerId: '' }).success).toBe(
      false,
    );
  });

  it('defaults confirmWidening to false, so widening is never implied', () => {
    const parsed = setAccessInputSchema.parse({ ...ref, principals: [] });
    expect(parsed.confirmWidening).toBe(false);
  });

  it('refuses a principal list that is not a list of strings', () => {
    expect(
      setAccessInputSchema.safeParse({ ...ref, principals: 'org:x' }).success,
    ).toBe(false);
    expect(
      setAccessInputSchema.safeParse({ ...ref, principals: [1] }).success,
    ).toBe(false);
  });
});
