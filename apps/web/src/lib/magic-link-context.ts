/**
 * In-memory context bridge between the `signInMagicLink` call site (e.g.
 * `inviteMember`) and Better Auth's `sendMagicLink` callback that fires
 * within the same process a few ms later. Keyed by lowercased email.
 *
 * Cleared in the callback's `finally` block, so the map stays tiny under
 * normal traffic. Single-process only — if we ever shard server instances
 * across processes we'd need to move this to Redis or write it to the
 * invitation row.
 */
export type MagicLinkContext = {
  type: 'organization-invitation';
  inviterName: string;
  organizationName: string;
  invitationId: string;
  role: string;
};

export const pendingMagicLinkContext = new Map<string, MagicLinkContext>();
