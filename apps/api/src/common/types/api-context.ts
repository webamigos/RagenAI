import {
  type KeyId,
  type UserId,
  type OrgId,
  type ProjectId,
} from './brand.js';

export interface ApiContext {
  orgId: OrgId;
  userId: UserId;
  projectId?: ProjectId;
  keyId: KeyId;
  debugMode: boolean;
  /**
   * The team the caller says it is acting for, from `x-ragen-team-id`.
   *
   * **Unvalidated here, by design.** It is caller-supplied, so membership is
   * checked where it is used — `TeamRateLimitService.resolveUsageTeam` — and a
   * team the caller does not belong to falls through as if it were absent.
   * Trusting it at this layer would let an integration spend another team's
   * per-minute allowance.
   */
  teamId?: string;
}

export const API_CONTEXT_KEY = 'apiContext';
