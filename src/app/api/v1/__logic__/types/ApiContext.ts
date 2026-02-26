import { type KeyId, type UserId, type OrgId, type ProjectId } from './brand';

export interface ApiContext {
  orgId: OrgId;
  userId: UserId;
  projectId?: ProjectId;
  keyId?: KeyId;
}
