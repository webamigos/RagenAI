import type { BrainOverview } from '../contracts/brain-overview.types';

export type BrainNextStep =
  | { kind: 'assign-owners'; count: number; path: string }
  | { kind: 'review'; count: number; path: string }
  | { kind: 'publish'; count: number; path: string };

/**
 * The one thing the overview asks of a curator now, or nothing.
 *
 * In this order, because each step unblocks the next: a page without an
 * owner cannot be approved, so owners come before review; an approved page
 * waits for publication. The overview used to offer "Rozpocznij przegląd (n)"
 * whatever the state, and with every page unowned it led to a screen where
 * nothing could be approved.
 */
export function nextStep(
  data: Pick<
    BrainOverview,
    'candidates' | 'unownedCandidates' | 'awaitingPublication'
  >,
): BrainNextStep | null {
  if (data.unownedCandidates > 0) {
    return {
      kind: 'assign-owners',
      count: data.unownedCandidates,
      path: '/brain?status=CANDIDATE&owner=none',
    };
  }
  if (data.candidates > 0) {
    return { kind: 'review', count: data.candidates, path: '/brain/review' };
  }
  if (data.awaitingPublication > 0) {
    return {
      kind: 'publish',
      count: data.awaitingPublication,
      path: '/brain?status=APPROVED',
    };
  }
  return null;
}
