import { KeyId, OrgId, ProjectId } from './brand';

export interface ApiContext {
  orgId: OrgId;
  projectId?: ProjectId;
  keyId?: KeyId;
}
