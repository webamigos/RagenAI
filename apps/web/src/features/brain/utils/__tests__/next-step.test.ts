import { describe, expect, it } from 'vitest';

import { nextStep } from '../next-step';

const state = (
  candidates: number,
  unownedCandidates: number,
  awaitingPublication: number,
) => ({ candidates, unownedCandidates, awaitingPublication });

describe('nextStep', () => {
  it('asks for owners first, since an unowned page cannot be approved', () => {
    expect(nextStep(state(123, 123, 2))).toEqual({
      kind: 'assign-owners',
      count: 123,
      path: '/brain?status=CANDIDATE&owner=none',
    });
  });

  it('sends to review once every page to review has an owner', () => {
    expect(nextStep(state(5, 0, 2))).toEqual({
      kind: 'review',
      count: 5,
      path: '/brain/review',
    });
  });

  it('asks to publish when nothing is left to review', () => {
    expect(nextStep(state(0, 0, 2))).toEqual({
      kind: 'publish',
      count: 2,
      path: '/brain?status=APPROVED',
    });
  });

  it('asks nothing when there is nothing to do', () => {
    expect(nextStep(state(0, 0, 0))).toBeNull();
  });
});
