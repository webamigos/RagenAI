import { KeyId, UserId, OrgId, ProjectId } from './brand';

export interface ApiContext {
  orgId: OrgId;
  userId: UserId;
  projectId?: ProjectId;
  keyId?: KeyId;
}
