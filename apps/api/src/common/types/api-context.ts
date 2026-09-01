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
}

export const API_CONTEXT_KEY = 'apiContext';
