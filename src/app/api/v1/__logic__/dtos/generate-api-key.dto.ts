import { KeyId, UserId, OrgId, ProjectId } from '../types/brand';

export type GenerateApiKeyDto = {
  orgId: OrgId;
  userId: UserId;
  projectId: ProjectId;
  keyId: KeyId;
};
