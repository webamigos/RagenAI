export type ProjectPermissionLevel = 'view' | 'full';
export type ProjectGranteeType = 'user' | 'team';

export type ProjectPermissionItem = {
  id: string;
  granteeType: ProjectGranteeType;
  granteeId: string;
  granteeName: string;
  granteeEmail?: string;
  permission: ProjectPermissionLevel;
};

export type EffectiveProjectPermission = {
  canView: boolean;
  canManage: boolean;
  canShare: boolean;
  canDelete: boolean;
  source: 'owner' | 'orgAdmin' | 'directShare' | 'teamShare' | 'none';
};

export type ShareProjectInput = {
  projectId: string;
  granteeType: ProjectGranteeType;
  granteeId: string;
  permission: ProjectPermissionLevel;
};
