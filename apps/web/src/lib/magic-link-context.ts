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
  /** Absent when the inviter has neither a name nor an email to show. */
  inviterName?: string;
  organizationName: string;
  invitationId: string;
  role: string;
  /**
   * The language the inviter was using. The email is sent from a callback that
   * has lost the request, so it is captured here, while there still is one;
   * unset falls back to resolving it from whatever request is around.
   */
  locale?: string;
};

export const pendingMagicLinkContext = new Map<string, MagicLinkContext>();
