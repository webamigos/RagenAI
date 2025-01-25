import { KeyId, OrgId, ProjectId } from '../types/brand';

export type GenerateApiKeyDto = {
  orgId: OrgId;
  projectId: ProjectId;
  keyId: KeyId;
};
