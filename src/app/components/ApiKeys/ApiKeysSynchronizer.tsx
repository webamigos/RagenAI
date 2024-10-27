/**
 * The role of this component is to check if database contains proper organization data in database
 * If everything is ok then display children
 * If not - create new record
 */
import { auth } from '@clerk/nextjs/server';

import db from '@salesyy/prisma-client';

type Props = {
  children: React.ReactNode;
};

export const ApiKeysSynchronizer = async ({ children }: Props) => {
  const { orgId } = auth();
  if (!orgId) {
    throw new Error('Organization not found');
  }

  // try {
  //   const organizationRecord = await db.organization.findUniqueOrThrow({
  //     where: {
  //       provider_id: orgId,
  //     },
  //   });
  // } catch (err) {}

  // console.log({ orgId });

  return children;
};
