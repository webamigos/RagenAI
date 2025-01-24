import { auth } from '@clerk/nextjs/server';

export const getOrgIdOrThrow = () => {
  const { orgId } = auth();
  if (!orgId) {
    throw new Error('Invalid organization!');
  }
  return orgId;
};
