import { z } from 'zod';

/**
 * What the review actions (spec D2) take and answer. Every action names the
 * page by its `publicId` and carries the `updatedAt` the reviewer saw: a
 * decision is about the page as it was read, and one taken against a page
 * someone else has changed since is refused rather than applied on top.
 */

const pageRef = {
  publicId: z.string().uuid(),
  /** The page's `updatedAt` as the reviewer's screen showed it (ISO). */
  expectedUpdatedAt: z.string().datetime(),
};

export const pageDecisionInputSchema = z.object(pageRef);
export type PageDecisionInput = z.infer<typeof pageDecisionInputSchema>;

export const setOwnerInputSchema = z.object({
  ...pageRef,
  ownerId: z.string().min(1).max(200),
});
export type SetOwnerInput = z.infer<typeof setOwnerInputSchema>;

export const setAccessInputSchema = z.object({
  ...pageRef,
  /**
   * The complete new `accessibleBy`, not a delta: the ledger records from
   * what to what, and a delta applied to a list the reviewer did not see
   * would record neither.
   */
  principals: z.array(z.string().max(200)).max(500),
  /**
   * The reviewer has seen, and accepted, that this change lets someone read
   * the page who could not before. The server decides whether a change widens
   * — this only says the person confirmed it.
   */
  confirmWidening: z.boolean().default(false),
});
export type SetAccessInput = z.input<typeof setAccessInputSchema>;

/**
 * Why a decision was not recorded. Codes rather than sentences: the panel
 * renders them in fifteen languages.
 *
 * - `invalid-input` — the request did not have the shape above.
 * - `not-found` — no such page in this organization, or no right to review.
 * - `conflict` — the page changed after the reviewer opened it.
 * - `invalid-status` — the action does not apply to a page in this status.
 * - `owner-required` — a page is approved only once someone vouches for it.
 * - `owner-not-member` — the owner named is not a member of the organization.
 * - `invalid-access` — a principal that would match nobody here.
 * - `published` — the page is in the index; changing its access must reach
 *   its chunks, which is Phase E's (E4), so it is refused until then.
 * - `confirm-widening` — the change widens access and was not confirmed.
 */
export type ReviewError =
  | 'invalid-input'
  | 'not-found'
  | 'conflict'
  | 'invalid-status'
  | 'owner-required'
  | 'owner-not-member'
  | 'invalid-access'
  | 'published'
  | 'confirm-widening';

/**
 * `changed: false` is a request that asked for what the page already is — no
 * decision is written, because the ledger records acts, not clicks.
 */
export type ReviewResult =
  { success: true; changed: boolean } | { success: false; error: ReviewError };

/** Who a reviewer may name as owner, or grant access to. */
export type ReviewOptions = {
  members: { userId: string; name: string }[];
  teams: { id: string; name: string }[];
};
