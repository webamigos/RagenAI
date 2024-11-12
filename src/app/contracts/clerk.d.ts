import '@clerk/nextjs';

import { UserRole } from './User';

declare module '@clerk/nextjs' {
  interface UserPublicMetadata {
    role?: UserRole;
  }
}

declare global {
  interface CustomJwtSessionClaims {
    membership: OrganizationRoles;
  }
}
