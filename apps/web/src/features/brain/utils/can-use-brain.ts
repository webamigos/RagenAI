import { canManageOrg } from '@/lib/auth-access-control';

/**
 * Whether a member with `role` may open Brain, given the organization's flag.
 *
 * Owners and admins only. Brain is a curation tool: its pages carry the
 * access of the documents they came from, and an organization manager's
 * visibility already covers every document (`orgVisibilityScope`), so the
 * panel needs no per-page filter to be correct for them. A member sees
 * curated knowledge through retrieval once it is published (Phase E), with
 * the page's `accessible_by` on its chunks. A platform admin is not let in by
 * that role alone: this is the customer's knowledge.
 */
export function canUseBrain(input: {
  role: string | null | undefined;
  enabled: boolean;
}): boolean {
  return input.enabled && canManageOrg(input.role);
}
