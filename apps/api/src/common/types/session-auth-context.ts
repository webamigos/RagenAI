import { type UserId, type OrgId, type ProjectId } from './brand.js';

export interface SessionAuthContext {
  userId: UserId;
  orgId: OrgId;
  projectId?: ProjectId;
}

export const SESSION_AUTH_CONTEXT_KEY = 'sessionAuthContext';
