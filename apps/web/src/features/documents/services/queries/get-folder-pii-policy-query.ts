import db from '@ragenai/prisma-client';
import { PiiPolicy } from '@/generated/prisma/client';

export async function getFolderPiiPolicyQuery(
  folderId: string,
  organizationId: string,
): Promise<PiiPolicy> {
  const folder = await db.documentFolder.findFirst({
    where: { id: folderId, organizationId },
    select: { piiPolicy: true },
  });
  return folder?.piiPolicy ?? PiiPolicy.TOXIC_ONLY;
}
