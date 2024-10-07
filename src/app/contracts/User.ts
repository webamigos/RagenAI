export type UserRole = 'admin' | 'user' | 'guest' | 'visitor' | 'superAdmin';
export type OrgRole = 'org:member' | 'org:owner' | 'org:admin';

export type OrganizationRoles = {
  [key: string]: OrgRole;
};
