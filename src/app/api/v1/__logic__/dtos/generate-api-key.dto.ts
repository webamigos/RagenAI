import {
  type KeyId,
  type UserId,
  type OrgId,
  type ProjectId,
} from '../types/brand';

export type GenerateApiKeyDto = {
  orgId: OrgId;
  userId: UserId;
  projectId: ProjectId;
  keyId: KeyId;
};
