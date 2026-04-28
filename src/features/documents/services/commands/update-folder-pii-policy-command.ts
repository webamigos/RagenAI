import db from '@ragenai/prisma-client';
import { PiiPolicy } from '@/generated/prisma/client';

const VALID_POLICIES = new Set<PiiPolicy>(
  Object.values(PiiPolicy) as PiiPolicy[],
);

export async function updateFolderPiiPolicyCommand(
  folderId: string,
  organizationId: string,
  piiPolicy: PiiPolicy,
): Promise<void> {
  if (!VALID_POLICIES.has(piiPolicy)) {
    throw new Error(`Invalid piiPolicy value: ${piiPolicy}`);
  }
  await db.documentFolder.update({
    where: { id: folderId, organizationId },
    data: { piiPolicy },
  });
}
