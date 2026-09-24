import { canManageOrg } from '@/lib/auth-access-control';

export type BrainAccess = 'write' | 'read';

export interface BrainFlags {
  /** The feature itself. Off, nobody gets in. */
  brain: boolean;
  /** Brain's write side. Off, Brain is read-only for everyone. */
  manageBrain: boolean;
  /** Members may browse, read-only. Off, only owners and admins get in. */
  brainForMembers: boolean;
}

/**
 * What a member with `role` may do in Brain, given the organization's flags:
 * curate it (`write`), browse it (`read`), or nothing (`null`, which every
 * route turns into a 404).
 *
 * By default only owners and admins. Brain is a curation tool, and its pages
 * carry what their source documents say: an organization manager's
 * visibility already covers every document (`orgVisibilityScope`), so the
 * panel needs no per-page filter to be correct for them. A member sees
 * curated knowledge through retrieval once it is published, with the page's
 * `accessible_by` on its chunks.
 *
 * `brainForMembers` lets every member browse anyway: it is a showcase switch,
 * a disclosure the operator makes knowingly (see its note in
 * `@ragenai/platform-contracts`). It never grants writing — a member reads.
 * `manageBrain` off freezes Brain for everyone, managers included.
 *
 * A platform admin is not let in by that role alone: this is the customer's
 * knowledge.
 */
export function brainAccess(input: {
  role: string | null | undefined;
  flags: BrainFlags;
}): BrainAccess | null {
  const { role, flags } = input;
  if (!flags.brain || !role) {
    return null;
  }
  if (canManageOrg(role)) {
    return flags.manageBrain ? 'write' : 'read';
  }
  return flags.brainForMembers ? 'read' : null;
}

/** Whether a member with `role` may open Brain at all. */
export function canUseBrain(input: {
  role: string | null | undefined;
  flags: BrainFlags;
}): boolean {
  return brainAccess(input) !== null;
}
