import { db, type UserDocument, type UserFile } from '../../services/db';

export async function bindFileWithDocument({
  fileId,
  documentId,
  orgId,
}: {
  fileId: UserFile['id'];
  documentId: UserDocument['id'];
  orgId: UserFile['organizationId'];
}) {
  return await db.bindFileWithDocument(fileId, documentId, orgId);
}
