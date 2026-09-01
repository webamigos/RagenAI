export type PermissionLevel = 'view' | 'full';
export type ResourceType = 'file' | 'folder';
export type GranteeType = 'user' | 'team';

export type DocumentPermissionItem = {
  id: string;
  resourceType: ResourceType;
  granteeType: GranteeType;
  granteeId: string;
  granteeName: string;
  granteeEmail?: string;
  permission: PermissionLevel;
};

export type ShareFileInput = {
  fileId: string;
  granteeType: GranteeType;
  granteeId: string;
  permission: PermissionLevel;
};

export type ShareFolderInput = {
  folderId: string;
  granteeType: GranteeType;
  granteeId: string;
  permission: PermissionLevel;
};

export type EffectivePermission = {
  canView: boolean;
  canManage: boolean;
  source:
    'owner' | 'orgAdmin' | 'team' | 'directShare' | 'folderShare' | 'orgWide';
};
