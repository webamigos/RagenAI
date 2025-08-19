import { auth } from '@clerk/nextjs/server';

export const getOrgIdOrThrow = async () => {
  const { orgId } = await auth();
  if (!orgId) {
    throw new Error('Invalid organization!');
  }
  return orgId;
};
